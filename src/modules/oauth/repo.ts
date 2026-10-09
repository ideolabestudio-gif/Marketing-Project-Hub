import { and, desc, eq, isNull, lt } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { oauthClients, oauthCodes, oauthGrants, oauthTokens, users } from "@/lib/db/schema";

export type ClientRow = typeof oauthClients.$inferSelect;

export async function insertClient(values: typeof oauthClients.$inferInsert): Promise<ClientRow> {
  const [row] = await getDb().insert(oauthClients).values(values).returning();
  return row;
}

export async function findClient(id: string): Promise<ClientRow | undefined> {
  const [row] = await getDb().select().from(oauthClients).where(eq(oauthClients.id, id)).limit(1);
  return row;
}

export async function insertGrant(values: { clientId: string; userId: string }): Promise<{ id: string }> {
  const [row] = await getDb().insert(oauthGrants).values(values).returning({ id: oauthGrants.id });
  return row;
}

export async function insertCode(values: typeof oauthCodes.$inferInsert): Promise<void> {
  await getDb().insert(oauthCodes).values(values);
}

/** Marca el código como usado en la misma operación que lo lee: no se puede canjear dos veces. */
export async function consumeCode(id: string, now: Date) {
  return getDb().transaction(async (tx) => {
    const [row] = await tx
      .select({ code: oauthCodes, grant: oauthGrants })
      .from(oauthCodes)
      .innerJoin(oauthGrants, eq(oauthGrants.id, oauthCodes.grantId))
      .where(eq(oauthCodes.id, id))
      .for("update")
      .limit(1);
    if (!row) return undefined;
    if (!row.code.usedAt) await tx.update(oauthCodes).set({ usedAt: now }).where(eq(oauthCodes.id, id));
    return row;
  });
}

export async function insertTokens(values: (typeof oauthTokens.$inferInsert)[]): Promise<void> {
  await getDb().insert(oauthTokens).values(values);
}

/** Lee un token con su permiso y su usuario. */
export async function findToken(id: string) {
  const [row] = await getDb()
    .select({ token: oauthTokens, grant: oauthGrants, user: users })
    .from(oauthTokens)
    .innerJoin(oauthGrants, eq(oauthGrants.id, oauthTokens.grantId))
    .innerJoin(users, eq(users.id, oauthGrants.userId))
    .where(eq(oauthTokens.id, id))
    .limit(1);
  return row;
}

/** Marca un token de refresco como usado. Devuelve false si ya lo estaba (reutilización). */
export async function consumeRefreshToken(id: string, now: Date): Promise<boolean> {
  const rows = await getDb()
    .update(oauthTokens)
    .set({ usedAt: now })
    .where(and(eq(oauthTokens.id, id), eq(oauthTokens.kind, "refresh"), isNull(oauthTokens.usedAt)))
    .returning({ id: oauthTokens.id });
  return rows.length === 1;
}

export async function deleteExpiredTokens(grantId: string, now: Date): Promise<void> {
  await getDb().delete(oauthTokens).where(and(eq(oauthTokens.grantId, grantId), lt(oauthTokens.expiresAt, now)));
}

export async function touchGrant(grantId: string, now: Date): Promise<void> {
  await getDb().update(oauthGrants).set({ lastUsedAt: now }).where(eq(oauthGrants.id, grantId));
}

/** Revoca el permiso y borra sus tokens y códigos. Solo actúa sobre permisos de ese usuario. */
export async function revokeGrant(grantId: string, userId: string, now: Date): Promise<boolean> {
  return getDb().transaction(async (tx) => {
    const rows = await tx
      .update(oauthGrants)
      .set({ revokedAt: now })
      .where(and(eq(oauthGrants.id, grantId), eq(oauthGrants.userId, userId), isNull(oauthGrants.revokedAt)))
      .returning({ id: oauthGrants.id });
    if (rows.length === 0) return false;
    await tx.delete(oauthTokens).where(eq(oauthTokens.grantId, grantId));
    await tx.delete(oauthCodes).where(eq(oauthCodes.grantId, grantId));
    return true;
  });
}

export async function listActiveGrants(userId: string) {
  return getDb()
    .select({
      id: oauthGrants.id,
      clientName: oauthClients.name,
      createdAt: oauthGrants.createdAt,
      lastUsedAt: oauthGrants.lastUsedAt,
    })
    .from(oauthGrants)
    .innerJoin(oauthClients, eq(oauthClients.id, oauthGrants.clientId))
    .where(and(eq(oauthGrants.userId, userId), isNull(oauthGrants.revokedAt)))
    .orderBy(desc(oauthGrants.createdAt));
}
