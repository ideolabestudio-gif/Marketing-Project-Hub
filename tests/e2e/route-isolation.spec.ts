import { globSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { MARKER_A, MARKER_B } from "../fixtures/markers";
import { readState, sessionCookie } from "./state";

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

/** Valores de ejemplo para segmentos dinámicos adicionales. Si falta uno, la prueba falla. */
function fill(route: string, projectId: string): string {
  const url = route.replace("[projectId]", projectId);
  if (url.includes("[")) throw new Error(`Añade un valor de ejemplo para los segmentos dinámicos de ${route}`);
  return url;
}

test("se han encontrado páginas de proyecto que probar", () => {
  expect(PROJECT_PAGES).toContain("/p/[projectId]");
});

for (const route of PROJECT_PAGES) {
  test(`${route}: un usuario de A recibe 404 sin datos al pedir el proyecto B (HT-01)`, async ({ request }) => {
    const s = readState();
    const res = await request.get(fill(route, s.projectB), { headers: sessionCookie(s.tokens.ana), maxRedirects: 0 });
    expect(res.status()).toBe(404);
    expect(await res.text()).not.toContain(MARKER_B);
  });

  test(`${route}: el manager de A sí la ve, sin datos de B`, async ({ request }) => {
    const s = readState();
    const res = await request.get(fill(route, s.projectA), { headers: sessionCookie(s.tokens.ana), maxRedirects: 0 });
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toContain(MARKER_A);
    expect(body).not.toContain(MARKER_B);
  });

  test(`${route}: un administrador que no es miembro recibe 404`, async ({ request }) => {
    const s = readState();
    const res = await request.get(fill(route, s.projectA), { headers: sessionCookie(s.tokens.admin), maxRedirects: 0 });
    expect(res.status()).toBe(404);
  });

  test(`${route}: sin sesión redirige al login (HT-04)`, async ({ request }) => {
    const s = readState();
    const res = await request.get(fill(route, s.projectA), { maxRedirects: 0 });
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
