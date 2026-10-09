import { getEnv, type Env } from "@/lib/env";

// Configuración del inicio de sesión OAuth del conector de Claude.

export const ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000;
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const CODE_TTL_MS = 5 * 60 * 1000;

/** Direcciones de vuelta de Claude (claude.ai y claude.com). Ninguna otra recibe códigos. */
export const CLAUDE_REDIRECT_URIS = [
  "https://claude.ai/api/mcp/auth_callback",
  "https://claude.com/api/mcp/auth_callback",
];

/** Error con el formato de OAuth ({ error, error_description }). */
export class OAuthError extends Error {
  constructor(
    readonly code: string,
    readonly description: string,
    readonly status = 400,
  ) {
    super(description);
    this.name = "OAuthError";
  }
}

export function oauthUrls(env: Env = getEnv()) {
  const issuer = env.APP_URL.replace(/\/+$/, "");
  return {
    issuer,
    resource: `${issuer}/api/mcp`,
    authorize: `${issuer}/oauth/authorize`,
    token: `${issuer}/oauth/token`,
    register: `${issuer}/oauth/register`,
    resourceMetadata: `${issuer}/.well-known/oauth-protected-resource/api/mcp`,
  };
}

export function allowedRedirectUris(env: Env = getEnv()): string[] {
  const extra = env.OAUTH_EXTRA_REDIRECT_URIS.split(",")
    .map((u) => u.trim())
    .filter(Boolean);
  return [...CLAUDE_REDIRECT_URIS, ...extra];
}
