import { createHash, randomBytes } from "node:crypto";
import type { Actor } from "./actor";
import {
  deleteSession,
  deleteSessionsForUser,
  findSessionWithUser,
  insertSession,
  touchSession,
} from "./repo";

/** Caducidad absoluta de una sesión. */
export const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
/** Caducidad por inactividad. */
export const SESSION_IDLE_TIMEOUT_MS = 8 * 60 * 60 * 1000;
/** Para no escribir en BD en cada petición. */
const TOUCH_INTERVAL_MS = 60 * 1000;

export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

/** En BD solo se guarda el hash: una copia de la BD no permite suplantar sesiones. */
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(
  userId: string,
  now = new Date(),
): Promise<{ token: string; expiresAt: Date }> {
  const token = generateSessionToken();
  const expiresAt = new Date(now.getTime() + SESSION_MAX_AGE_MS);
  await insertSession({
    id: hashSessionToken(token),
    userId,
    createdAt: now,
    lastSeenAt: now,
    expiresAt,
  });
  return { token, expiresAt };
}

/** Devuelve el usuario de la sesión o null si no existe, caducó o el usuario está desactivado. */
export async function validateSessionToken(token: string, now = new Date()): Promise<Actor | null> {
  if (!token || token.length > 200) return null;
  const sessionId = hashSessionToken(token);
  const row = await findSessionWithUser(sessionId);
  if (!row) return null;
  const { session, user } = row;

  const expired = session.expiresAt.getTime() <= now.getTime();
  const idle = now.getTime() - session.lastSeenAt.getTime() > SESSION_IDLE_TIMEOUT_MS;
  if (expired || idle || !user.isActive) {
    await deleteSession(sessionId);
    return null;
  }
  if (now.getTime() - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    await touchSession(sessionId, now);
  }
  return Object.freeze({
    userId: user.id,
    email: user.email,
    name: user.name,
    isAdmin: user.isAdmin,
  });
}

export async function invalidateSession(token: string): Promise<void> {
  await deleteSession(hashSessionToken(token));
}

export async function invalidateUserSessions(userId: string): Promise<void> {
  await deleteSessionsForUser(userId);
}
