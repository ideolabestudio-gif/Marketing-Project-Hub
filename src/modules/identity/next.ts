import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getEnv, isSecureDeployment } from "@/lib/env";
import type { Actor } from "./actor";
import { invalidateSession, SESSION_MAX_AGE_MS, validateSessionToken } from "./session";

// Integración de la sesión con Next.js (cookies, redirecciones). La lógica de sesión
// está en session.ts, que no depende de Next y se prueba por separado.

export function sessionCookieName(): string {
  return isSecureDeployment(getEnv()) ? "__Host-mph_session" : "mph_session";
}

export async function setSessionCookie(token: string, expiresAt: Date): Promise<void> {
  const store = await cookies();
  store.set(sessionCookieName(), token, {
    httpOnly: true,
    secure: isSecureDeployment(getEnv()),
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
    maxAge: Math.floor(SESSION_MAX_AGE_MS / 1000),
  });
}

export async function getCurrentActor(): Promise<Actor | null> {
  const token = (await cookies()).get(sessionCookieName())?.value;
  if (!token) return null;
  return validateSessionToken(token);
}

/** Para páginas y acciones: sin sesión válida redirige al login. */
export async function requireActor(): Promise<Actor> {
  const actor = await getCurrentActor();
  if (!actor) redirect("/login");
  return actor;
}

/** Para páginas de /admin: un no administrador recibe un 404. */
export async function requireAdminActor(): Promise<Actor> {
  const actor = await requireActor();
  if (!actor.isAdmin) notFound();
  return actor;
}

export async function endCurrentSession(): Promise<void> {
  const store = await cookies();
  const name = sessionCookieName();
  const token = store.get(name)?.value;
  if (token) await invalidateSession(token);
  store.delete(name);
}
