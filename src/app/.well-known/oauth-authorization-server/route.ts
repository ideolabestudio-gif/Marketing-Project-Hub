import { jsonResponse, preflight } from "@/lib/oauth-http";
import { oauthUrls } from "@/modules/oauth/config";

export const dynamic = "force-dynamic";

/** Metadatos del servidor de autorización (RFC 8414). */
export function GET() {
  const urls = oauthUrls();
  return jsonResponse({
    issuer: urls.issuer,
    authorization_endpoint: urls.authorize,
    token_endpoint: urls.token,
    registration_endpoint: urls.register,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
  });
}

export const OPTIONS = preflight;
