import { execFileSync } from "node:child_process";
import { createMigratedDatabase } from "../setup/database";

export default async function globalSetup() {
  const databaseUrl = await createMigratedDatabase("mph_e2e");
  execFileSync("npx", ["tsx", "tests/e2e/seed.ts"], {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
}
