import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/lib/db/client";
import { auditEvents, sessions, users } from "@/lib/db/schema";
import { ConflictError, ValidationError } from "@/lib/errors";
import { adminInviteUser, adminSetUserActive, loginWithGoogle, type GoogleClaims } from "@/modules/identity/service";
import {
  createSession,
  hashSessionToken,
  SESSION_IDLE_TIMEOUT_MS,
  SESSION_MAX_AGE_MS,
  validateSessionToken,
} from "@/modules/identity/session";
import { resetDatabase, seedTwoProjects, type Fixture } from "../fixtures/two-projects";

const claims = (over: Partial<GoogleClaims> = {}): GoogleClaims => ({
  sub: "google-sub-1",
  email: "ana@ideolab.test",
  email_verified: true,
  name: "Ana",
  ...over,
});
const policy = { bootstrapAdminEmails: [] as string[] };

describe("loginWithGoogle", () => {
  let fx: Fixture;
  beforeEach(async () => {
    fx = await seedTwoProjects();
  });

  it("deja entrar a un email dado de alta y vincula la cuenta de Google", async () => {
    const result = await loginWithGoogle(claims(), policy);
    expect(result).toEqual({ ok: true, userId: fx.users.ana.id });
    const [u] = await getDb().select().from(users).where(eq(users.id, fx.users.ana.id));
    expect(u.googleSub).toBe("google-sub-1");
    expect(u.lastLoginAt).not.toBeNull();
  });

  it("rechaza y audita un email no dado de alta", async () => {
    const result = await loginWithGoogle(claims({ email: "intruso@gmail.com" }), policy);
    expect(result).toEqual({ ok: false, reason: "not_allowed" });
    const events = await getDb().select().from(auditEvents).where(eq(auditEvents.action, "auth.login_denied"));
    expect(events).toHaveLength(1);
    expect(await getDb().select().from(users).where(eq(users.email, "intruso@gmail.com"))).toEqual([]);
  });

  it("compara emails sin distinguir mayúsculas", async () => {
    expect(await loginWithGoogle(claims({ email: "ANA@Ideolab.test" }), policy)).toMatchObject({ ok: true });
  });

  it("rechaza emails no verificados, otro dominio, usuarios desactivados y cuentas distintas", async () => {
    expect(await loginWithGoogle(claims({ email_verified: false }), policy)).toEqual({
      ok: false,
      reason: "email_not_verified",
    });
    expect(await loginWithGoogle(claims({ hd: "otra.com" }), { ...policy, hostedDomain: "ideolab.es" })).toEqual({
      ok: false,
      reason: "wrong_domain",
    });
    await loginWithGoogle(claims(), policy);
    expect(await loginWithGoogle(claims({ sub: "otro-sub" }), policy)).toEqual({
      ok: false,
      reason: "account_mismatch",
    });
    await getDb().update(users).set({ isActive: false }).where(eq(users.id, fx.users.ana.id));
    expect(await loginWithGoogle(claims(), policy)).toEqual({ ok: false, reason: "inactive" });
  });

  it("crea como administrador a un email de arranque", async () => {
    await resetDatabase();
    const result = await loginWithGoogle(claims({ email: "jefa@ideolab.test" }), {
      bootstrapAdminEmails: ["Jefa@ideolab.test"],
    });
    expect(result.ok).toBe(true);
    const [u] = await getDb().select().from(users).where(eq(users.email, "jefa@ideolab.test"));
    expect(u.isAdmin).toBe(true);
  });
});

describe("sesiones", () => {
  let fx: Fixture;
  beforeEach(async () => {
    fx = await seedTwoProjects();
  });

  it("solo guarda el hash del token", async () => {
    const { token } = await createSession(fx.users.ana.id);
    const rows = await getDb().select().from(sessions);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(hashSessionToken(token));
    expect(rows[0].id).not.toBe(token);
  });

  it("valida un token correcto y rechaza uno falso", async () => {
    const { token } = await createSession(fx.users.ana.id);
    expect(await validateSessionToken(token)).toMatchObject({ userId: fx.users.ana.id, isAdmin: false });
    expect(await validateSessionToken(token + "x")).toBeNull();
    expect(await validateSessionToken("")).toBeNull();
  });

  it("caduca por inactividad y por antigüedad", async () => {
    const start = new Date("2026-01-01T10:00:00Z");
    const idle = await createSession(fx.users.ana.id, start);
    expect(await validateSessionToken(idle.token, new Date(start.getTime() + SESSION_IDLE_TIMEOUT_MS + 1000))).toBeNull();

    const old = await createSession(fx.users.ana.id, start);
    expect(await validateSessionToken(old.token, new Date(start.getTime() + SESSION_MAX_AGE_MS + 1000))).toBeNull();
  });

  it("desactivar un usuario cierra sus sesiones (criterio F1)", async () => {
    const { token } = await createSession(fx.users.edu.id);
    expect(await validateSessionToken(token)).not.toBeNull();
    await adminSetUserActive(fx.actors.admin, { userId: fx.users.edu.id, active: false });
    expect(await validateSessionToken(token)).toBeNull();
    expect(await getDb().select().from(sessions).where(eq(sessions.userId, fx.users.edu.id))).toEqual([]);
  });

  it("un administrador no puede desactivarse a sí mismo", async () => {
    await expect(
      adminSetUserActive(fx.actors.admin, { userId: fx.users.admin.id, active: false }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("alta de usuarios", () => {
  let fx: Fixture;
  beforeEach(async () => {
    fx = await seedTwoProjects();
  });

  it("normaliza el email y no admite duplicados", async () => {
    await adminInviteUser(fx.actors.admin, { email: "  Nuevo@Ideolab.TEST " });
    const [u] = await getDb().select().from(users).where(eq(users.email, "nuevo@ideolab.test"));
    expect(u).toBeDefined();
    await expect(adminInviteUser(fx.actors.admin, { email: "nuevo@ideolab.test" })).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it("rechaza emails no válidos", async () => {
    await expect(adminInviteUser(fx.actors.admin, { email: "no-es-email" })).rejects.toBeInstanceOf(ValidationError);
  });
});
