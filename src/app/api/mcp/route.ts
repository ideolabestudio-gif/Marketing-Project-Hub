import { jsonResponse, preflight } from "@/lib/oauth-http";
import { handleMessage } from "@/modules/mcp/server";
import { oauthUrls } from "@/modules/oauth/config";
import { authenticateAccessToken } from "@/modules/oauth/service";

const MAX_BODY_BYTES = 2 * 1024 * 1024;

function unauthorized(invalidToken: boolean): Response {
  const metadata = `resource_metadata="${oauthUrls().resourceMetadata}"`;
  return jsonResponse({ error: "No autorizado" }, 401, {
    "WWW-Authenticate": invalidToken ? `Bearer error="invalid_token", ${metadata}` : `Bearer ${metadata}`,
  });
}

/** Conector de Claude (MCP). Cada llamada actúa como la persona dueña del token. */
export async function POST(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return unauthorized(false);
  const actor = await authenticateAccessToken(token);
  if (!actor) return unauthorized(true);

  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    return jsonResponse({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Petición demasiado grande" } }, 413);
  }
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) {
    return jsonResponse({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Petición demasiado grande" } }, 413);
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return jsonResponse({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "JSON no válido" } }, 400);
  }
  if (Array.isArray(body)) {
    return jsonResponse({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "No se admiten lotes" } }, 400);
  }
  const response = await handleMessage(actor, body);
  if (!response) return new Response(null, { status: 202, headers: { "Access-Control-Allow-Origin": "*" } });
  return jsonResponse(response);
}

/** Sin canal de eventos (SSE): el servidor solo responde a peticiones. */
export function GET() {
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
}

export const OPTIONS = preflight;
