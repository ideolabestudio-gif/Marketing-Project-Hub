import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/lib/db/client";
import { auditEvents, users } from "@/lib/db/schema";
import { NotFoundError } from "@/lib/errors";
import { CLAUDE_REDIRECT_URIS, CODE_TTL_MS, OAuthError, oauthUrls } from "@/modules/oauth/config";
import {
  approveAuthorization,
  authenticateAccessToken,
  checkAuthorizationRequest,
  denyAuthorization,
  exchangeToken,
  listMyConnections,
  registerClient,
  revokeMyConnection,
} from "@/modules/oauth/service";
import { seedTwoProjects, type Fixture } from "../fixtures/two-projects";

const REDIRECT = CLAUDE_REDIRECT_URIS[0];

function pkce() {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
}

let fx: Fixture;
let clientId: string;

beforeEach(async () => {
  fx = await seedTwoProjects();
  clientId = (await registerClient({ client_name: "Claude", redirect_uris: [REDIRECT] })).client_id;
});

function authParams(challenge: string, over: Record<string, string | undefined> = {}) {
  return {
    response_type: "code",
    client_id: clientId,
    redirect_uri: REDIRECT,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state: "estado-1",
    resource: oauthUrls().resource,
    ...over,
  };
}

/** Recorre el flujo completo y devuelve los tokens. */
async function connect(actor = fx.actors.ana) {
  const { verifier, challenge } = pkce();
  const redirect = new URL(await approveAuthorization(actor, authParams(challenge)));
  const code = redirect.searchParams.get("code")!;
  const tokens = await exchangeToken({
    grant_type: "authorization_code",
    client_id: clientId,
    code,
    code_verifier: verifier,
    redirect_uri: REDIRECT,
  });
  return { code, verifier, tokens };
}

describe("registro de la aplicación", () => {
  it("solo admite las direcciones de vuelta de Claude", async () => {
    await expect(registerClient({ redirect_uris: ["https://atacante.example/callback"] })).rejects.toMatchObject({
      code: "invalid_redirect_uri",
    });
    await expect(registerClient({})).rejects.toBeInstanceOf(OAuthError);
    for (const uri of ["http://claude.ai/api/mcp/auth_callback", "https://claude.ai.atacante.example/cb", "https://claude.ai:8443/cb", "nada"]) {
      await expect(registerClient({ redirect_uris: [uri] }), uri).rejects.toMatchObject({ code: "invalid_redirect_uri" });
    }
  });

  it("admite cualquier ruta https de claude.ai o claude.com", async () => {
    for (const uri of ["https://claude.com/api/mcp/auth_callback", "https://claude.ai/otra/ruta/callback"]) {
      expect((await registerClient({ redirect_uris: [uri] })).redirect_uris).toEqual([uri]);
    }
  });
});

describe("autorización", () => {
  it("rechaza en el Hub (sin redirigir) una aplicación o dirección desconocida", async () => {
    const { challenge } = pkce();
    expect(await checkAuthorizationRequest(authParams(challenge, { client_id: "no-existe" }))).toMatchObject({ ok: false, message: expect.any(String) });
    expect(
      await checkAuthorizationRequest(authParams(challenge, { redirect_uri: "https://atacante.example/cb" })),
    ).toMatchObject({ ok: false, message: expect.any(String) });
  });

  it("exige PKCE con S256 y el recurso del Hub", async () => {
    const noPkce = await checkAuthorizationRequest(authParams("", { code_challenge: undefined }));
    expect(noPkce).toMatchObject({ ok: false, redirectTo: expect.stringContaining("error=invalid_request") });
    const plain = await checkAuthorizationRequest(authParams("x", { code_challenge_method: "plain" }));
    expect(plain).toMatchObject({ ok: false, redirectTo: expect.stringContaining("error=invalid_request") });
    const other = await checkAuthorizationRequest(authParams("x", { resource: "https://otro.example/mcp" }));
    expect(other).toMatchObject({ ok: false, redirectTo: expect.stringContaining("error=invalid_target") });
  });

  it("cancelar devuelve access_denied con el state", async () => {
    const url = new URL(await denyAuthorization(authParams(pkce().challenge)));
    expect(url.searchParams.get("error")).toBe("access_denied");
    expect(url.searchParams.get("state")).toBe("estado-1");
  });

  it("permitir da un token que actúa como esa persona y queda auditado", async () => {
    const { tokens } = await connect();
    expect(tokens.token_type).toBe("Bearer");
    const actor = await authenticateAccessToken(tokens.access_token);
    expect(actor?.userId).toBe(fx.users.ana.id);
    const audit = await getDb().select().from(auditEvents).where(eq(auditEvents.action, "oauth.authorized"));
    expect(audit.map((a) => a.actorId)).toEqual([fx.users.ana.id]);
  });
});

describe("tokens", () => {
  it("no canjea un código con un verificador PKCE incorrecto", async () => {
    const { challenge } = pkce();
    const code = new URL(await approveAuthorization(fx.actors.ana, authParams(challenge))).searchParams.get("code")!;
    await expect(
      exchangeToken({ grant_type: "authorization_code", client_id: clientId, code, code_verifier: pkce().verifier }),
    ).rejects.toMatchObject({ code: "invalid_grant" });
  });

  it("un código reutilizado no vale y corta el acceso ya concedido", async () => {
    const { code, verifier, tokens } = await connect();
    await expect(
      exchangeToken({ grant_type: "authorization_code", client_id: clientId, code, code_verifier: verifier }),
    ).rejects.toMatchObject({ code: "invalid_grant" });
    expect(await authenticateAccessToken(tokens.access_token)).toBeNull();
  });

  it("un código caducado no vale", async () => {
    const { verifier, challenge } = pkce();
    const past = new Date(Date.now() - CODE_TTL_MS - 1000);
    const code = new URL(await approveAuthorization(fx.actors.ana, authParams(challenge), past)).searchParams.get("code")!;
    await expect(
      exchangeToken({ grant_type: "authorization_code", client_id: clientId, code, code_verifier: verifier }),
    ).rejects.toMatchObject({ code: "invalid_grant" });
  });

  it("el refresco rota el token y reutilizar uno viejo revoca la conexión", async () => {
    const { tokens } = await connect();
    const renewed = await exchangeToken({ grant_type: "refresh_token", client_id: clientId, refresh_token: tokens.refresh_token });
    expect(await authenticateAccessToken(renewed.access_token)).not.toBeNull();
    await expect(
      exchangeToken({ grant_type: "refresh_token", client_id: clientId, refresh_token: tokens.refresh_token }),
    ).rejects.toMatchObject({ code: "invalid_grant" });
    expect(await authenticateAccessToken(renewed.access_token)).toBeNull();
  });

  it("un token caducado o de un usuario desactivado no vale", async () => {
    const { tokens } = await connect();
    expect(await authenticateAccessToken(tokens.access_token, new Date(Date.now() + 2 * 60 * 60 * 1000))).toBeNull();
    await getDb().update(users).set({ isActive: false }).where(eq(users.id, fx.users.ana.id));
    expect(await authenticateAccessToken(tokens.access_token)).toBeNull();
  });

  it("rechaza aplicaciones desconocidas y tipos de concesión no admitidos", async () => {
    await expect(exchangeToken({ grant_type: "client_credentials", client_id: "x" })).rejects.toMatchObject({
      code: "invalid_client",
    });
    await expect(exchangeToken({ grant_type: "password", client_id: clientId })).rejects.toMatchObject({
      code: "unsupported_grant_type",
    });
  });
});

describe("conexiones de la persona", () => {
  it("cada persona ve y desconecta solo las suyas", async () => {
    const { tokens } = await connect(fx.actors.ana);
    await connect(fx.actors.bea);
    const mine = await listMyConnections(fx.actors.ana);
    expect(mine).toHaveLength(1);
    expect(await listMyConnections(fx.actors.bea)).toHaveLength(1);

    await expect(revokeMyConnection(fx.actors.bea, mine[0].id)).rejects.toBeInstanceOf(NotFoundError);
    expect(await authenticateAccessToken(tokens.access_token)).not.toBeNull();

    await revokeMyConnection(fx.actors.ana, mine[0].id);
    expect(await authenticateAccessToken(tokens.access_token)).toBeNull();
    expect(await listMyConnections(fx.actors.ana)).toHaveLength(0);
  });
});
