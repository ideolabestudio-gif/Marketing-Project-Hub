import { asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { sessions, users } from "@/lib/db/schema";

export type UserRow = typeof users.$inferSelect;

export async function findUserByEmail(email: string): Promise<UserRow | undefined> {
  const [row] = await getDb().select().from(users).where(eq(users.email, email)).limit(1);
  return row;
}

export async function findUserById(id: string): Promise<UserRow | undefined> {
  const [row] = await getDb().select().from(users).where(eq(users.id, id)).limit(1);
  return row;
}

export async function insertUser(values: typeof users.$inferInsert): Promise<UserRow> {
  const [row] = await getDb().insert(users).values(values).returning();
  return row;
}

export async function updateUser(
  id: string,
  values: Partial<typeof users.$inferInsert>,
): Promise<UserRow | undefined> {
  const [row] = await getDb().update(users).set(values).where(eq(users.id, id)).returning();
  return row;
}

export async function listUsers(): Promise<UserRow[]> {
  return getDb().select().from(users).orderBy(asc(users.email));
}

export async function insertSession(values: typeof sessions.$inferInsert): Promise<void> {
  await getDb().insert(sessions).values(values);
}

export async function findSessionWithUser(sessionId: string) {
  const [row] = await getDb()
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.id, sessionId))
    .limit(1);
  return row;
}

export async function touchSession(sessionId: string, lastSeenAt: Date): Promise<void> {
  await getDb().update(sessions).set({ lastSeenAt }).where(eq(sessions.id, sessionId));
}

export async function deleteSession(sessionId: string): Promise<void> {
  await getDb().delete(sessions).where(eq(sessions.id, sessionId));
}

export async function deleteSessionsForUser(userId: string): Promise<void> {
  await getDb().delete(sessions).where(eq(sessions.userId, userId));
}
