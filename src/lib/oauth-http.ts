import { OAuthError } from "@/modules/oauth/config";

// Respuestas HTTP comunes del conector de Claude (rutas /oauth, /.well-known y /api/mcp).
// Estas rutas no usan cookies, así que admitir cualquier origen (CORS) no expone nada.

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Mcp-Protocol-Version, Mcp-Session-Id",
  "Access-Control-Expose-Headers": "WWW-Authenticate",
};

export function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers: { ...CORS_HEADERS, "Cache-Control": "no-store", ...headers } });
}

export function oauthErrorResponse(err: unknown): Response {
  if (err instanceof OAuthError) {
    // Queda en los registros de Render para saber por qué falla una conexión (sin secretos).
    console.warn(`[oauth] ${err.code}: ${err.description}`);
    return jsonResponse({ error: err.code, error_description: err.description }, err.status);
  }
  throw err;
}

export function preflight(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

/** Lee un cuerpo JSON o de formulario como objeto de cadenas. */
export async function readParams(request: Request): Promise<Record<string, string>> {
  const type = request.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== "object") return {};
    return Object.fromEntries(
      Object.entries(body as Record<string, unknown>).filter((e): e is [string, string] => typeof e[1] === "string"),
    );
  }
  const form = await request.formData().catch(() => null);
  if (!form) return {};
  return Object.fromEntries([...form.entries()].filter((e): e is [string, string] => typeof e[1] === "string"));
}
