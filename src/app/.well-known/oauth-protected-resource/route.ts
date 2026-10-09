import { jsonResponse, preflight } from "@/lib/oauth-http";
import { oauthUrls } from "@/modules/oauth/config";

export const dynamic = "force-dynamic";

/** Metadatos del recurso protegido (RFC 9728): dónde se obtiene el token para /api/mcp. */
export function GET() {
  const urls = oauthUrls();
  return jsonResponse({
    resource: urls.resource,
    authorization_servers: [urls.issuer],
    bearer_methods_supported: ["header"],
    resource_name: "Marketing Project Hub",
  });
}

export const OPTIONS = preflight;
