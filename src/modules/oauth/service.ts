import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { NotFoundError } from "@/lib/errors";
import { isUuid } from "@/lib/validation";
import { recordAudit } from "@/modules/audit/service";
import type { Actor } from "@/modules/identity/actor";
import { ACCESS_TOKEN_TTL_MS, allowedRedirectUris, CODE_TTL_MS, OAuthError, oauthUrls, REFRESH_TOKEN_TTL_MS } from "./config";
import * as repo from "./repo";

// Inicio de sesión del conector de Claude (OAuth 2.1 con PKCE obligatorio). Claude se
// registra solo (RFC 7591), la persona entra en el Hub con su cuenta de Google y pulsa
// «Permitir»; Claude recibe un token que actúa en nombre de esa persona. Lo que puede
// hacer con él lo decide /api/mcp, que autoriza cada llamada proyecto a proyecto.

const TOUCH_INTERVAL_MS = 60 * 1000;

function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

// ---------------------------------------------------------------------------
// Registro de la aplicación (lo hace Claude al añadir el conector)
// ---------------------------------------------------------------------------

const registerSchema = z.object({
  client_name: z.string().trim().max(100).optional(),
  redirect_uris: z.array(z.string()).min(1).max(5),
});

export async function registerClient(input: unknown) {
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) throw new OAuthError("invalid_client_metadata", "Faltan redirect_uris");
  const allowed = allowedRedirectUris();
  const bad = parsed.data.redirect_uris.find((u) => !allowed.includes(u));
  if (bad) throw new OAuthError("invalid_redirect_uri", "Este Hub solo admite el conector de Claude");

  const client = await repo.insertClient({
    id: randomToken(),
    name: parsed.data.client_name || "Claude",
    redirectUris: parsed.data.redirect_uris,
  });
  await recordAudit({ action: "oauth.client_registered", entityType: "oauth_client", data: { name: client.name } });
  return {
    client_id: client.id,
    client_id_issued_at: Math.floor(client.createdAt.getTime() / 1000),
    client_name: client.name,
    redirect_uris: client.redirectUris,
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
  };
}

// ---------------------------------------------------------------------------
// Autorización (la persona pulsa «Permitir» en el Hub)
// ---------------------------------------------------------------------------

export type AuthorizationParams = Record<string, string | undefined>;

export type AuthorizationCheck =
  | { ok: true; clientName: string; params: AuthorizationParams }
  /** Error que se muestra en el Hub: la dirección de vuelta no es de fiar. */
  | { ok: false; message: string }
  /** Error que se devuelve a la aplicación por su dirección de vuelta. */
  | { ok: false; redirectTo: string };

function withParams(uri: string, params: Record<string, string | undefined>): string {
  const url = new URL(uri);
  for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.set(k, v);
  return url.toString();
}

/** Comprueba una petición de /oauth/authorize sin crear nada. */
export async function checkAuthorizationRequest(params: AuthorizationParams): Promise<AuthorizationCheck> {
  const client = params.client_id ? await repo.findClient(params.client_id) : undefined;
  if (!client) return { ok: false, message: "La aplicación que pide acceso no está registrada." };
  const redirectUri = params.redirect_uri ?? (client.redirectUris.length === 1 ? client.redirectUris[0] : undefined);
  if (!redirectUri || !client.redirectUris.includes(redirectUri)) {
    return { ok: false, message: "La dirección de vuelta de la aplicación no es válida." };
  }
  const fail = (error: string, description: string) => ({
    ok: false as const,
    redirectTo: withParams(redirectUri, { error, error_description: description, state: params.state }),
  });
  if (params.response_type !== "code") return fail("unsupported_response_type", "Solo se admite response_type=code");
  if (!params.code_challenge || params.code_challenge_method !== "S256") {
    return fail("invalid_request", "PKCE (S256) es obligatorio");
  }
  if (params.resource && params.resource.replace(/\/+$/, "") !== oauthUrls().resource) {
    return fail("invalid_target", "Recurso desconocido");
  }
  return { ok: true, clientName: client.name, params: { ...params, redirect_uri: redirectUri } };
}

/** La persona permite el acceso: crea el permiso y un código de un solo uso. */
export async function approveAuthorization(actor: Actor, params: AuthorizationParams, now = new Date()): Promise<string> {
  const check = await checkAuthorizationRequest(params);
  if (!check.ok) {
    if ("redirectTo" in check) return check.redirectTo;
    throw new OAuthError("invalid_request", check.message);
  }
  const p = check.params;
  const grant = await repo.insertGrant({ clientId: p.client_id!, userId: actor.userId });
  const code = randomToken();
  await repo.insertCode({
    id: hash(code),
    grantId: grant.id,
    redirectUri: p.redirect_uri!,
    codeChallenge: p.code_challenge!,
    expiresAt: new Date(now.getTime() + CODE_TTL_MS),
  });
  await recordAudit({
    action: "oauth.authorized",
    actorId: actor.userId,
    entityType: "oauth_grant",
    entityId: grant.id,
    data: { client: check.clientName },
  });
  return withParams(p.redirect_uri!, { code, state: p.state });
}

/** La persona no permite el acceso. */
export async function denyAuthorization(params: AuthorizationParams): Promise<string> {
  const check = await checkAuthorizationRequest(params);
  if (!check.ok) {
    if ("redirectTo" in check) return check.redirectTo;
    throw new OAuthError("invalid_request", check.message);
  }
  return withParams(check.params.redirect_uri!, { error: "access_denied", state: params.state });
}

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

async function issueTokens(grantId: string, now: Date) {
  const access = randomToken();
  const refresh = randomToken();
  await repo.insertTokens([
    { id: hash(access), grantId, kind: "access", createdAt: now, expiresAt: new Date(now.getTime() + ACCESS_TOKEN_TTL_MS) },
    { id: hash(refresh), grantId, kind: "refresh", createdAt: now, expiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_MS) },
  ]);
  return {
    access_token: access,
    token_type: "Bearer",
    expires_in: Math.floor(ACCESS_TOKEN_TTL_MS / 1000),
    refresh_token: refresh,
  };
}

function pkceMatches(verifier: string, challenge: string): boolean {
  if (!/^[A-Za-z0-9\-._~]{43,128}$/.test(verifier)) return false;
  return createHash("sha256").update(verifier).digest("base64url") === challenge;
}

/** Endpoint /oauth/token: canjea un código o un token de refresco. */
export async function exchangeToken(form: Record<string, string | undefined>, now = new Date()) {
  const clientId = form.client_id;
  if (!clientId || !(await repo.findClient(clientId))) {
    throw new OAuthError("invalid_client", "Aplicación desconocida", 401);
  }
  if (form.resource && form.resource.replace(/\/+$/, "") !== oauthUrls().resource) {
    throw new OAuthError("invalid_target", "Recurso desconocido");
  }

  if (form.grant_type === "authorization_code") {
    if (!form.code || !form.code_verifier) throw new OAuthError("invalid_request", "Faltan code o code_verifier");
    const row = await repo.consumeCode(hash(form.code), now);
    const invalid = new OAuthError("invalid_grant", "Código no válido o caducado");
    if (!row || row.grant.clientId !== clientId || row.grant.revokedAt) throw invalid;
    if (row.code.usedAt) {
      // Un código reutilizado indica que alguien lo interceptó: se corta el acceso.
      await repo.revokeGrant(row.grant.id, row.grant.userId, now);
      throw invalid;
    }
    if (row.code.expiresAt.getTime() <= now.getTime()) throw invalid;
    if (form.redirect_uri && form.redirect_uri !== row.code.redirectUri) throw invalid;
    if (!pkceMatches(form.code_verifier, row.code.codeChallenge)) throw invalid;
    return issueTokens(row.grant.id, now);
  }

  if (form.grant_type === "refresh_token") {
    const invalid = new OAuthError("invalid_grant", "Token de refresco no válido o caducado");
    if (!form.refresh_token) throw invalid;
    const id = hash(form.refresh_token);
    const row = await repo.findToken(id);
    if (!row || row.token.kind !== "refresh" || row.grant.clientId !== clientId || row.grant.revokedAt) throw invalid;
    if (!row.user.isActive || row.token.expiresAt.getTime() <= now.getTime()) throw invalid;
    if (!(await repo.consumeRefreshToken(id, now))) {
      // Reutilización de un refresco ya usado: se revoca el permiso completo.
      await repo.revokeGrant(row.grant.id, row.grant.userId, now);
      throw invalid;
    }
    await repo.deleteExpiredTokens(row.grant.id, now);
    return issueTokens(row.grant.id, now);
  }

  throw new OAuthError("unsupported_grant_type", "Tipo de concesión no admitido");
}

/** Valida el token de una llamada a /api/mcp. Devuelve la persona o null. */
export async function authenticateAccessToken(token: string, now = new Date()): Promise<Actor | null> {
  if (!token || token.length > 200) return null;
  const row = await repo.findToken(hash(token));
  if (!row || row.token.kind !== "access" || row.grant.revokedAt || !row.user.isActive) return null;
  if (row.token.expiresAt.getTime() <= now.getTime()) return null;
  if (!row.grant.lastUsedAt || now.getTime() - row.grant.lastUsedAt.getTime() > TOUCH_INTERVAL_MS) {
    await repo.touchGrant(row.grant.id, now);
  }
  return Object.freeze({ userId: row.user.id, email: row.user.email, name: row.user.name, isAdmin: row.user.isAdmin });
}

// ---------------------------------------------------------------------------
// Conexiones de la persona (para verlas y revocarlas)
// ---------------------------------------------------------------------------

export async function listMyConnections(actor: Actor) {
  return repo.listActiveGrants(actor.userId);
}

/** Desconecta Claude: los tokens dejan de valer al momento. */
export async function revokeMyConnection(actor: Actor, grantId: string, now = new Date()): Promise<void> {
  if (!isUuid(grantId) || !(await repo.revokeGrant(grantId, actor.userId, now))) throw new NotFoundError();
  await recordAudit({ action: "oauth.revoked", actorId: actor.userId, entityType: "oauth_grant", entityId: grantId });
}
