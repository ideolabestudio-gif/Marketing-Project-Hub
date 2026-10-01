import { Google } from "arctic";
import { getEnv } from "@/lib/env";

/** Cliente OAuth de Google, o null si faltan las credenciales en el entorno. */
export function googleClient(): Google | null {
  const env = getEnv();
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return null;
  return new Google(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, `${env.APP_URL}/auth/google/callback`);
}
