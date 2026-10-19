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

  await page.getByRole("link", { name: /octubre/i }).click();
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
