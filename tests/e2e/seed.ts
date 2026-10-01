// Siembra la BD de E2E. Se ejecuta con tsx (resuelve los alias @/ de tsconfig)
// desde global-setup.ts, con DATABASE_URL ya apuntando a mph_e2e.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { getDb } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { createSession } from "@/modules/identity/session";
import { seedTwoProjects } from "../fixtures/two-projects";
import { E2E_STATE_FILE, type E2EState } from "./state";

async function main() {
  const fx = await seedTwoProjects();
  const [inactive] = await getDb().insert(users).values({ email: "baja@ideolab.test", isActive: false }).returning();
  const token = async (userId: string) => (await createSession(userId)).token;

  const state: E2EState = {
    projectA: fx.projectA.id,
    projectB: fx.projectB.id,
    tokens: {
      ana: await token(fx.users.ana.id),
      edu: await token(fx.users.edu.id),
      bea: await token(fx.users.bea.id),
      mix: await token(fx.users.mix.id),
      admin: await token(fx.users.admin.id),
      inactive: await token(inactive.id),
    },
  };
  mkdirSync(dirname(E2E_STATE_FILE), { recursive: true });
  writeFileSync(E2E_STATE_FILE, JSON.stringify(state));
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
