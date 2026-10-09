import { jsonResponse, oauthErrorResponse, preflight, readParams } from "@/lib/oauth-http";
import { exchangeToken } from "@/modules/oauth/service";

/** Canje de código (con PKCE) y renovación de tokens. */
export async function POST(request: Request) {
  const params = await readParams(request);
  try {
    return jsonResponse(await exchangeToken(params));
  } catch (err) {
    return oauthErrorResponse(err);
  }
}

export const OPTIONS = preflight;
