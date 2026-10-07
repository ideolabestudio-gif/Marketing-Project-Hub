import { globSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { MARKER_A, MARKER_B } from "../fixtures/markers";
import { readState, sessionCookie, type ProjectSample } from "./state";

/**
 * HT-01: recorre TODAS las páginas bajo /p/[projectId] leyendo el sistema de ficheros,
 * así una página nueva queda cubierta automáticamente.
 */
const ALL_PAGES = globSync("src/app/**/page.tsx")
  .map((file) =>
    file
      .replace(/\\/g, "/")
      .replace(/^src\/app/, "")
      .replace(/\/\([^)]+\)/g, "") // grupos de rutas, p. ej. (app)
      .replace(/\/page\.tsx$/, ""),
  )
  .sort();
const PROJECT_PAGES = ALL_PAGES.filter((r) => r === "/p/[projectId]" || r.startsWith("/p/[projectId]/"));
const ADMIN_PAGES = ALL_PAGES.filter((r) => r === "/admin" || r.startsWith("/admin/"));

/**
 * Rellena los segmentos dinámicos con datos de ejemplo. `ids` aporta el proyecto de la URL
 * y `res` los recursos (pieza, mes…), que pueden ser de otro proyecto (HT-02).
 * Si aparece un segmento sin valor de ejemplo, la prueba falla.
 */
function fill(route: string, ids: ProjectSample, res: ProjectSample = ids): string {
  const url = route
    .replace("[projectId]", ids.projectId)
    .replace("[period]", res.period)
    .replace("[itemId]", res.itemId)
    .replace("[importId]", res.importId);
  if (url.includes("[")) throw new Error(`Añade un valor de ejemplo para los segmentos dinámicos de ${route}`);
  return url;
}

test("se han encontrado páginas de proyecto que probar", () => {
  expect(PROJECT_PAGES).toContain("/p/[projectId]");
});

for (const route of PROJECT_PAGES) {
  test(`${route}: un usuario de A recibe 404 sin datos al pedir el proyecto B (HT-01)`, async ({ request }) => {
    const s = readState();
    const res = await request.get(fill(route, s.b), { headers: sessionCookie(s.tokens.ana), maxRedirects: 0 });
    expect(res.status()).toBe(404);
    expect(await res.text()).not.toContain(MARKER_B);
  });

  test(`${route}: el manager de A sí la ve, sin datos de B`, async ({ request }) => {
    const s = readState();
    const res = await request.get(fill(route, s.a), { headers: sessionCookie(s.tokens.ana), maxRedirects: 0 });
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toContain(MARKER_A);
    expect(body).not.toContain(MARKER_B);
  });

  if (route.includes("[itemId]") || route.includes("[importId]")) {
    test(`${route}: proyecto A con un recurso de B da 404 (HT-02)`, async ({ request }) => {
      const s = readState();
      const res = await request.get(fill(route, s.a, s.b), { headers: sessionCookie(s.tokens.ana), maxRedirects: 0 });
      expect(res.status()).toBe(404);
      expect(await res.text()).not.toContain(MARKER_B);
    });
  }

  test(`${route}: un administrador que no es miembro recibe 404`, async ({ request }) => {
    const s = readState();
    const res = await request.get(fill(route, s.a), { headers: sessionCookie(s.tokens.admin), maxRedirects: 0 });
    expect(res.status()).toBe(404);
  });

  test(`${route}: sin sesión redirige al login (HT-04)`, async ({ request }) => {
    const s = readState();
    const res = await request.get(fill(route, s.a), { maxRedirects: 0 });
    expect([303, 307]).toContain(res.status());
    expect(res.headers()["location"]).toContain("/login");
    expect(await res.text()).not.toContain(MARKER_A);
  });
}

test("ajustes: un miembro sin permiso (viewer) recibe 404", async ({ request }) => {
  const s = readState();
  const res = await request.get(`/p/${s.projectA}/ajustes`, { headers: sessionCookie(s.tokens.mix), maxRedirects: 0 });
  expect(res.status()).toBe(404);
});

test("mis proyectos: cada usuario ve solo los suyos", async ({ request }) => {
  const s = readState();
  const ana = await (await request.get("/", { headers: sessionCookie(s.tokens.ana) })).text();
  expect(ana).toContain(MARKER_A);
  expect(ana).not.toContain(MARKER_B);
  const bea = await (await request.get("/", { headers: sessionCookie(s.tokens.bea) })).text();
  expect(bea).toContain(MARKER_B);
  expect(bea).not.toContain(MARKER_A);
});

test("un ID de proyecto mal formado da 404", async ({ request }) => {
  const s = readState();
  const res = await request.get("/p/no-es-un-uuid", { headers: sessionCookie(s.tokens.ana), maxRedirects: 0 });
  expect(res.status()).toBe(404);
});

test("una sesión falsa o de un usuario desactivado redirige al login", async ({ request }) => {
  const s = readState();
  for (const token of ["inventado", s.tokens.inactive]) {
    const res = await request.get("/", { headers: sessionCookie(token), maxRedirects: 0 });
    expect([303, 307]).toContain(res.status());
    expect(res.headers()["location"]).toContain("/login");
  }
});

for (const route of ADMIN_PAGES) {
  test(`${route}: un no administrador recibe 404`, async ({ request }) => {
    const s = readState();
    const url = route.replace("[projectId]", s.projectA);
    const res = await request.get(url, { headers: sessionCookie(s.tokens.ana), maxRedirects: 0 });
    expect(res.status()).toBe(404);
  });

  test(`${route}: el administrador accede`, async ({ request }) => {
    const s = readState();
    const url = route.replace("[projectId]", s.projectA);
    const res = await request.get(url, { headers: sessionCookie(s.tokens.admin), maxRedirects: 0 });
    expect(res.status()).toBe(200);
  });
}

// --- Archivos (FS-01) ---

test("archivos: el miembro descarga su archivo con cabeceras seguras", async ({ request }) => {
  const s = readState();
  const res = await request.get(`/p/${s.a.projectId}/archivos/${s.a.assetId}`, { headers: sessionCookie(s.tokens.ana) });
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("image/png");
  expect(res.headers()["x-content-type-options"]).toBe("nosniff");
  expect(res.headers()["cache-control"]).toContain("no-store");
});

test("archivos: un archivo de B no se puede pedir desde A ni con la URL de B (FS-01)", async ({ request }) => {
  const s = readState();
  for (const url of [`/p/${s.a.projectId}/archivos/${s.b.assetId}`, `/p/${s.b.projectId}/archivos/${s.b.assetId}`]) {
    const res = await request.get(url, { headers: sessionCookie(s.tokens.ana) });
    expect(res.status(), url).toBe(404);
  }
});

test("archivos: sin sesión no hay descarga", async ({ request }) => {
  const s = readState();
  const res = await request.get(`/p/${s.a.projectId}/archivos/${s.a.assetId}`);
  expect(res.status()).toBe(401);
});
