import { jsonResponse, oauthErrorResponse, preflight } from "@/lib/oauth-http";
import { registerClient } from "@/modules/oauth/service";

/** Registro dinámico de la aplicación (RFC 7591). Solo se admiten las direcciones de Claude. */
export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  try {
    return jsonResponse(await registerClient(body), 201);
  } catch (err) {
    return oauthErrorResponse(err);
  }
}

export const OPTIONS = preflight;
