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
  await page.getByRole("link", { name: new RegExp(MARKER_A) }).click();
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
