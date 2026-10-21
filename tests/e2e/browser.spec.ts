import { expect, test } from "@playwright/test";
import { MARKER_A, MARKER_B } from "../fixtures/markers";
import { readState } from "./state";

/** E2E-01: navegación real en el navegador y manipulación de la URL hacia el proyecto B. */
test("un usuario recorre su proyecto y no puede entrar al de otro cliente cambiando la URL", async ({
  page,
  context,
  baseURL,
}) => {
  const s = readState();
  await context.addCookies([{ name: "mph_session", value: s.tokens.ana, url: baseURL! }]);

  await page.goto("/");
  // La tarjeta del proyecto (el panel de inicio también enlaza tareas que mencionan el proyecto).
  await page.locator(`a[href="/p/${s.projectA}"]`).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(MARKER_A);

  // Pestaña del mes en curso en el menú del proyecto.
  await page.getByRole("navigation", { name: "Proyecto" }).getByRole("link", { name: /octubre/i }).click();
  await page.getByRole("link", { name: "Lista" }).click();
  await page.getByRole("link", { name: `Pieza ${MARKER_A}` }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(`Pieza ${MARKER_A}`);
  await expect(page.getByRole("img", { name: new RegExp(MARKER_A) })).toBeVisible();

  const response = await page.goto(page.url().replace(s.a.itemId, s.b.itemId));
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "No encontrado" })).toBeVisible();
  expect(await page.content()).not.toContain(MARKER_B);

  const projectB = await page.goto(`/p/${s.b.projectId}`);
  expect(projectB?.status()).toBe(404);
  expect(await page.content()).not.toContain(MARKER_B);
});

/** «Crear diseño» (en cada post) y «Abrir Metricool» (en el proyecto) salen de los enlaces del proyecto. */
test("los enlaces de Claude Design y Metricool se configuran en Ajustes y aparecen en el proyecto", async ({
  page,
  context,
  baseURL,
}) => {
  const s = readState();
  await context.addCookies([{ name: "mph_session", value: s.tokens.ana, url: baseURL! }]);

  const itemUrl = `/p/${s.projectA}/ciclos/${s.a.period}/piezas/${s.a.itemId}`;
  await page.goto(itemUrl);
  await expect(page.getByRole("link", { name: /Crear diseño/ })).toHaveCount(0);
  await page.goto(`/p/${s.projectA}`);
  await expect(page.getByRole("link", { name: /Abrir Metricool/ })).toHaveAttribute("href", "https://app.metricool.com");

  await page.goto(`/p/${s.projectA}/ajustes`);
  const form = page.locator("form", { has: page.locator('input[name="designUrl"]') });
  await form.locator('input[name="designUrl"]').fill("https://claude.ai/design/p/ejemplo");
  await form.locator('input[name="metricoolUrl"]').fill("https://app.metricool.com/planner?blogId=1");
  await form.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Enlaces guardados")).toBeVisible();

  await page.goto(itemUrl);
  const design = page.getByRole("link", { name: /Crear diseño/ });
  await expect(design).toHaveAttribute("href", "https://claude.ai/design/p/ejemplo");
  await expect(design).toHaveAttribute("target", "_blank");

  await page.goto(`/p/${s.projectA}`);
  await expect(page.getByRole("link", { name: /Crear diseño/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Abrir Metricool/ })).toHaveAttribute(
    "href",
    "https://app.metricool.com/planner?blogId=1",
  );
});

/** Saltar al contenido, buscar piezas y la ficha de una pieza con «Qué toca ahora»: nunca asoma el proyecto B. */
test("saltar al contenido y buscar piezas solo dentro del proyecto", async ({ page, context, baseURL }) => {
  const s = readState();
  await context.addCookies([{ name: "mph_session", value: s.tokens.ana, url: baseURL! }]);

  await page.goto(`/p/${s.projectA}`);
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Saltar al contenido" });
  await expect(skip).toBeFocused();
  await skip.press("Enter");
  await expect(page.locator("#contenido")).toBeFocused();

  const search = page.getByRole("search");
  await search.getByRole("searchbox").fill("pieza");
  await search.getByRole("button", { name: "Buscar" }).click();
  await page.getByRole("list", { name: "Resultados" }).getByRole("link", { name: `Pieza ${MARKER_A}` }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(`Pieza ${MARKER_A}`);
  await expect(page.getByText("Qué toca ahora")).toBeVisible();
  expect(await page.content()).not.toContain(MARKER_B);

  await page.goto(`/p/${s.projectA}?buscar=${encodeURIComponent(MARKER_B)}`);
  await expect(page.getByRole("status").filter({ hasText: "Ninguna pieza contiene" })).toBeVisible();
});

/** Actividad y descarga del proyecto: solo la responsable y solo su proyecto. */
test("la responsable ve la actividad y descarga el ZIP; nadie más ni de otro proyecto", async ({ page, context, baseURL, request }) => {
  const s = readState();
  await context.addCookies([{ name: "mph_session", value: s.tokens.ana, url: baseURL! }]);
  await page.goto(`/p/${s.projectA}`);
  await page.getByRole("navigation", { name: "Proyecto" }).getByRole("link", { name: "Actividad" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Actividad del proyecto");
  await page.getByRole("link", { name: "Revisión y cliente" }).click();
  await expect(page.getByText("Registró la aprobación del cliente").first()).toBeVisible();
  expect(await page.content()).not.toContain(MARKER_B);

  const asAna = { headers: { cookie: `mph_session=${s.tokens.ana}` } };
  const zip = await request.get(`/p/${s.projectA}/exportar`, asAna);
  expect(zip.status()).toBe(200);
  expect(zip.headers()["content-type"]).toBe("application/zip");
  expect((await zip.body()).subarray(0, 2).toString()).toBe("PK");
  expect((await request.get(`/p/${s.projectB}/exportar`, asAna)).status()).toBe(404);
  expect((await request.get(`/p/${s.projectA}/exportar`, { headers: { cookie: `mph_session=${s.tokens.edu}` } })).status()).toBe(404);
  expect((await request.get(`/p/${s.projectA}/exportar`, { headers: { cookie: "" } })).status()).toBe(401);
});
