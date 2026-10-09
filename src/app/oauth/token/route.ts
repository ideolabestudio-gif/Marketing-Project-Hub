import { jsonResponse, oauthErrorResponse, preflight, readParams } from "@/lib/oauth-http";
import { exchangeToken } from "@/modules/oauth/service";

/** Canje de código (con PKCE) y renovación de tokens. */
export async function POST(request: Request) {
  const params = await readParams(request);
  // Algunas aplicaciones mandan client_id en la cabecera (HTTP Basic) en vez del cuerpo.
  const basic = request.headers.get("authorization");
  if (!params.client_id && basic?.startsWith("Basic ")) {
    const decoded = Buffer.from(basic.slice(6), "base64").toString("utf8");
    try {
      params.client_id = decodeURIComponent(decoded.split(":")[0] ?? "");
    } catch {
      // client_id mal codificado: exchangeToken responde invalid_client.
    }
  }
  try {
    return jsonResponse(await exchangeToken(params));
  } catch (err) {
    return oauthErrorResponse(err);
  }
}

export const OPTIONS = preflight;
