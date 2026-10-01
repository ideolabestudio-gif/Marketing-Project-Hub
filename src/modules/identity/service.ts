import { z } from "zod";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { isUniqueViolation, isUuid, parseInput } from "@/lib/validation";
import { recordAudit } from "@/modules/audit/service";
import { assertAdmin, type Actor } from "./actor";
import { findUserByEmail, findUserById, insertUser, listUsers, updateUser } from "./repo";
import { invalidateUserSessions } from "./session";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// ---------------------------------------------------------------------------
// Inicio de sesión
// ---------------------------------------------------------------------------

export const googleClaimsSchema = z.object({
  sub: z.string().min(1),
  email: z.email(),
  email_verified: z.boolean(),
  name: z.string().optional(),
  hd: z.string().optional(),
});
export type GoogleClaims = z.infer<typeof googleClaimsSchema>;

export type LoginPolicy = {
  /** Emails que se crean como administradores en su primer inicio de sesión. */
  bootstrapAdminEmails: string[];
  /** Si se define, solo se aceptan cuentas de este dominio de Google Workspace. */
  hostedDomain?: string;
};

export type LoginResult =
  | { ok: true; userId: string }
  | {
      ok: false;
      reason: "email_not_verified" | "wrong_domain" | "not_allowed" | "inactive" | "account_mismatch";
    };

/**
 * Decide si una identidad de Google puede entrar. Solo entran los emails dados de alta
 * por un administrador (o los de arranque). Todo rechazo queda auditado.
 */
export async function loginWithGoogle(claims: GoogleClaims, policy: LoginPolicy): Promise<LoginResult> {
  const email = normalizeEmail(claims.email);
  const deny = async (reason: Exclude<LoginResult, { ok: true }>["reason"], actorId?: string) => {
    await recordAudit({ action: "auth.login_denied", actorId, data: { email, reason } });
    return { ok: false as const, reason };
  };

  if (!claims.email_verified) return deny("email_not_verified");
  if (policy.hostedDomain && claims.hd !== policy.hostedDomain) return deny("wrong_domain");

  let user = await findUserByEmail(email);
  if (!user) {
    const bootstrap = policy.bootstrapAdminEmails.map(normalizeEmail).includes(email);
    if (!bootstrap) return deny("not_allowed");
    user = await insertUser({ email, name: claims.name ?? null, isAdmin: true });
    await recordAudit({ action: "user.bootstrapped_admin", actorId: user.id, entityType: "user", entityId: user.id });
  }
  if (!user.isActive) return deny("inactive", user.id);
  if (user.googleSub && user.googleSub !== claims.sub) return deny("account_mismatch", user.id);

  await updateUser(user.id, {
    googleSub: claims.sub,
    name: user.name ?? claims.name ?? null,
    lastLoginAt: new Date(),
  });
  await recordAudit({ action: "auth.login", actorId: user.id, entityType: "user", entityId: user.id });
  return { ok: true, userId: user.id };
}

// ---------------------------------------------------------------------------
// Administración de usuarios
// ---------------------------------------------------------------------------

export type UserSummary = {
  id: string;
  email: string;
  name: string | null;
  isAdmin: boolean;
  isActive: boolean;
  hasLoggedIn: boolean;
};

export async function adminListUsers(actor: Actor): Promise<UserSummary[]> {
  assertAdmin(actor);
  const rows = await listUsers();
  return rows.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    isAdmin: u.isAdmin,
    isActive: u.isActive,
    hasLoggedIn: u.lastLoginAt !== null,
  }));
}

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("Email no válido")),
  name: z.string().trim().max(120).optional(),
  isAdmin: z.boolean().default(false),
});

/** Da de alta un email: a partir de ese momento puede iniciar sesión con Google. */
export async function adminInviteUser(actor: Actor, input: z.input<typeof inviteSchema>): Promise<{ id: string }> {
  assertAdmin(actor);
  const data = parseInput(inviteSchema, input);
  const email = normalizeEmail(data.email);
  try {
    const user = await insertUser({
      email,
      name: data.name || null,
      isAdmin: data.isAdmin,
      createdBy: actor.userId,
    });
    await recordAudit({
      action: "user.invited",
      actorId: actor.userId,
      entityType: "user",
      entityId: user.id,
      data: { email, isAdmin: data.isAdmin },
    });
    return { id: user.id };
  } catch (err) {
    if (isUniqueViolation(err)) throw new ConflictError("Ese email ya está dado de alta");
    throw err;
  }
}

/** Desactivar un usuario cierra todas sus sesiones al momento. */
export async function adminSetUserActive(
  actor: Actor,
  input: { userId: string; active: boolean },
): Promise<void> {
  assertAdmin(actor);
  if (!isUuid(input.userId)) throw new NotFoundError();
  if (input.userId === actor.userId && !input.active) {
    throw new ValidationError("No puedes desactivar tu propio usuario");
  }
  const user = await findUserById(input.userId);
  if (!user) throw new NotFoundError();
  await updateUser(user.id, { isActive: input.active });
  if (!input.active) await invalidateUserSessions(user.id);
  await recordAudit({
    action: input.active ? "user.activated" : "user.deactivated",
    actorId: actor.userId,
    entityType: "user",
    entityId: user.id,
  });
}
