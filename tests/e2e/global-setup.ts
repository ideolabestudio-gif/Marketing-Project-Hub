import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { createMigratedDatabase } from "../setup/database";
import { E2E_STORAGE_DIR } from "./state";

export default async function globalSetup() {
  const databaseUrl = await createMigratedDatabase("mph_e2e");
  rmSync(E2E_STORAGE_DIR, { recursive: true, force: true });
  execFileSync("npx", ["tsx", "tests/e2e/seed.ts"], {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: databaseUrl, STORAGE_DIR: E2E_STORAGE_DIR },
  });
}
