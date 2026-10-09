import { generateCodeVerifier, generateState } from "arctic";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getEnv, isSecureDeployment } from "@/lib/env";
import { googleClient } from "@/modules/identity/google";
import { safeNextPath } from "@/modules/identity/next";

const OAUTH_COOKIE_MAX_AGE = 10 * 60;

/** Inicia el flujo OAuth (código + PKCE) con Google. `next`: ruta del Hub a la que volver. */
export async function GET(request: Request) {
  const env = getEnv();
  const google = googleClient();
  if (!google) {
    return NextResponse.redirect(new URL("/login?error=not_configured", env.APP_URL));
  }
  const state = generateState();
  const codeVerifier = generateCodeVerifier();
  const url = google.createAuthorizationURL(state, codeVerifier, ["openid", "email", "profile"]);
  url.searchParams.set("prompt", "select_account");
  if (env.AUTH_GOOGLE_HOSTED_DOMAIN) url.searchParams.set("hd", env.AUTH_GOOGLE_HOSTED_DOMAIN);

  const store = await cookies();
  const options = {
    httpOnly: true,
    secure: isSecureDeployment(env),
    sameSite: "lax" as const,
    path: "/",
    maxAge: OAUTH_COOKIE_MAX_AGE,
  };
  store.set("google_oauth_state", state, options);
  store.set("google_code_verifier", codeVerifier, options);
  const next = safeNextPath(new URL(request.url).searchParams.get("next"));
  if (next) store.set("login_next", next, options);
  else store.delete("login_next");
  return NextResponse.redirect(url);
}
