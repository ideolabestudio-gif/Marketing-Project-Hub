import { createHash, randomBytes } from "node:crypto";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { MARKER_A, MARKER_B } from "../fixtures/markers";
import { readState, sessionCookie } from "./state";

/** Conector de Claude: descubrimiento OAuth, permiso en el navegador y llamadas MCP por HTTP. */

const CLAUDE_CALLBACK = "https://claude.ai/api/mcp/auth_callback";

async function register(request: APIRequestContext): Promise<string> {
  const res = await request.post("/oauth/register", {
    data: { client_name: "Claude", redirect_uris: [CLAUDE_CALLBACK] },
  });
  expect(res.status()).toBe(201);
  return (await res.json()).client_id;
}

function mcp(request: APIRequestContext, token: string, method: string, params: Record<string, unknown> = {}) {
  return request.post("/api/mcp", {
    headers: { authorization: `Bearer ${token}`, accept: "application/json, text/event-stream" },
    data: { jsonrpc: "2.0", id: 1, method, params },
  });
}

test("publica los metadatos OAuth del conector", async ({ request, baseURL }) => {
  const resource = await (await request.get("/.well-known/oauth-protected-resource/api/mcp")).json();
  expect(resource).toMatchObject({ resource: `${baseURL}/api/mcp`, authorization_servers: [baseURL] });
  const server = await (await request.get("/.well-known/oauth-authorization-server")).json();
  expect(server).toMatchObject({
    issuer: baseURL,
    registration_endpoint: `${baseURL}/oauth/register`,
    code_challenge_methods_supported: ["S256"],
  });
});

test("sin token, /api/mcp responde 401 indicando dónde iniciar sesión", async ({ request }) => {
  const res = await request.post("/api/mcp", { data: { jsonrpc: "2.0", id: 1, method: "tools/list" } });
  expect(res.status()).toBe(401);
  expect(res.headers()["www-authenticate"]).toContain("resource_metadata=");
  const bad = await mcp(request, "token-falso", "tools/list");
  expect(bad.status()).toBe(401);
});

test("el registro rechaza direcciones de vuelta que no son de Claude", async ({ request }) => {
  const res = await request.post("/oauth/register", { data: { redirect_uris: ["https://atacante.example/cb"] } });
  expect(res.status()).toBe(400);
  expect((await res.json()).error).toBe("invalid_redirect_uri");
});

test("sin sesión, la pantalla de permiso lleva al login y vuelve después", async ({ request }) => {
  const clientId = await register(request);
  const res = await request.get(`/oauth/authorize?client_id=${clientId}&response_type=code`, { maxRedirects: 0 });
  expect(res.status()).toBe(307);
  expect(res.headers().location).toContain("/login?next=%2Foauth%2Fauthorize");
});

test("la persona permite el acceso y Claude usa el Hub con sus permisos", async ({ page, context, request, baseURL }) => {
  const s = readState();
  const clientId = await register(request);
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const query = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: CLAUDE_CALLBACK,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state: "xyz",
    resource: `${baseURL}/api/mcp`,
  });

  await context.addCookies([{ name: "mph_session", value: s.tokens.ana, url: baseURL! }]);
  // La vuelta a claude.ai se intercepta: aquí solo interesa el código que recibe.
  let callback: URL | null = null;
  await page.route(`${CLAUDE_CALLBACK}**`, (route) => {
    callback = new URL(route.request().url());
    return route.fulfill({ status: 200, body: "ok" });
  });
  await page.goto(`/oauth/authorize?${query}`);
  await expect(page.getByRole("heading", { name: "Conectar con Claude" })).toBeVisible();
  await page.getByRole("button", { name: "Permitir" }).click();
  await expect.poll(() => callback?.searchParams.get("code") ?? null).not.toBeNull();
  expect(callback!.searchParams.get("state")).toBe("xyz");

  const tokenRes = await request.post("/oauth/token", {
    form: {
      grant_type: "authorization_code",
      client_id: clientId,
      code: callback!.searchParams.get("code")!,
      code_verifier: verifier,
      redirect_uri: CLAUDE_CALLBACK,
    },
  });
  expect(tokenRes.status()).toBe(200);
  const { access_token } = await tokenRes.json();

  const init = await (await mcp(request, access_token, "initialize", { protocolVersion: "2025-06-18" })).json();
  expect(init.result.serverInfo.name).toBe("marketing-project-hub");

  const own = await (
    await mcp(request, access_token, "tools/call", { name: "ver_ciclo", arguments: { proyecto_id: s.a.projectId, periodo: s.a.period } })
  ).json();
  expect(own.result.isError).toBe(false);
  expect(own.result.content[0].text).toContain(MARKER_A);
  expect(own.result.content[0].text).not.toContain(MARKER_B);

  const foreign = await (
    await mcp(request, access_token, "tools/call", { name: "ver_ciclo", arguments: { proyecto_id: s.b.projectId, periodo: s.b.period } })
  ).json();
  expect(foreign.result.isError).toBe(true);
  expect(JSON.stringify(foreign)).not.toContain(MARKER_B);

  // Desconectar en el Hub corta el acceso al momento.
  await page.goto("/conexiones");
  await page.getByRole("button", { name: "Desconectar" }).first().click();
  await expect(page.getByText("No hay ninguna conexión activa.")).toBeVisible();
  expect((await mcp(request, access_token, "tools/list")).status()).toBe(401);
});

test("la página de conexiones exige sesión", async ({ request }) => {
  const res = await request.get("/conexiones", { maxRedirects: 0 });
  expect(res.status()).toBe(307);
  const s = readState();
  const ok = await request.get("/conexiones", { headers: sessionCookie(s.tokens.ana) });
  expect(await ok.text()).toContain("/api/mcp");
});
