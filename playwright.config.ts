import { defineConfig } from "@playwright/test";
import { databaseUrlFor } from "./tests/setup/database";

const PORT = 3100;
export const E2E_BASE_URL = `http://localhost:${PORT}`;
export const E2E_DATABASE_URL = databaseUrlFor("mph_e2e");

/**
 * Pruebas HTTP de extremo a extremo contra la app compilada (`npm run build` antes).
 * Usan una base de datos propia (mph_e2e) sembrada con el fixture de dos proyectos.
 */
export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: E2E_BASE_URL },
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `${E2E_BASE_URL}/login`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      DATABASE_URL: E2E_DATABASE_URL,
      APP_URL: E2E_BASE_URL,
    },
  },
});
