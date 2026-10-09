import { decodeIdToken } from "arctic";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { bootstrapAdminEmails, getEnv } from "@/lib/env";
import { googleClient } from "@/modules/identity/google";
import { safeNextPath, setSessionCookie } from "@/modules/identity/next";
import { googleClaimsSchema, loginWithGoogle } from "@/modules/identity/service";
import { createSession } from "@/modules/identity/session";

/** Vuelta de Google: valida state + PKCE, comprueba la lista de permitidos y crea la sesión. */
export async function GET(request: NextRequest) {
  const env = getEnv();
  const fail = (error: string) => NextResponse.redirect(new URL(`/login?error=${error}`, env.APP_URL));

  const google = googleClient();
  if (!google) return fail("not_configured");

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const store = await cookies();
  const storedState = store.get("google_oauth_state")?.value;
  const codeVerifier = store.get("google_code_verifier")?.value;
  store.delete("google_oauth_state");
  store.delete("google_code_verifier");
  const next = safeNextPath(store.get("login_next")?.value);
  store.delete("login_next");

  if (!code || !state || !storedState || !codeVerifier || state !== storedState) {
    return fail("invalid_request");
  }

  let claims;
  try {
    const tokens = await google.validateAuthorizationCode(code, codeVerifier);
    // El id_token llega directamente del endpoint de tokens de Google por TLS.
    claims = googleClaimsSchema.parse(decodeIdToken(tokens.idToken()));
  } catch {
    return fail("google_error");
  }

  const result = await loginWithGoogle(claims, {
    bootstrapAdminEmails: bootstrapAdminEmails(env),
    hostedDomain: env.AUTH_GOOGLE_HOSTED_DOMAIN,
  });
  if (!result.ok) return fail(result.reason);

  const session = await createSession(result.userId);
  await setSessionCookie(session.token, session.expiresAt);
  return NextResponse.redirect(new URL(next ?? "/", env.APP_URL));
}
