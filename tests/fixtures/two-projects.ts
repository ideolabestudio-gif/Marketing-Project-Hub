/**
 * Fixture estándar de aislamiento (docs/06-pruebas-aislamiento.md §6.1).
 * Todo texto del proyecto A lleva ALFA-SECRET y todo texto de B lleva BETA-SECRET, para
 * poder buscar en cualquier salida si se ha colado algo del otro proyecto.
 */
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { channels, clients, projectMemberships, projects, users } from "@/lib/db/schema";
import type { Actor } from "@/modules/identity/actor";
import { MARKER_A, MARKER_B } from "./markers";

export { MARKER_A, MARKER_B };

/** Vacía todas las tablas (incluida la auditoría, saltándose sus triggers solo en pruebas). */
export async function resetDatabase(): Promise<void> {
  await getDb().transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL session_replication_role = replica`);
    const rows = await tx.execute<{ tablename: string }>(
      sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
    );
    const names = rows.map((r) => `"${r.tablename}"`).join(", ");
    if (names) await tx.execute(sql.raw(`TRUNCATE ${names} CASCADE`));
  });
}

function toActor(u: typeof users.$inferSelect): Actor {
  return Object.freeze({ userId: u.id, email: u.email, name: u.name, isAdmin: u.isAdmin });
}

export async function seedTwoProjects() {
  await resetDatabase();
  const db = getDb();

  const [ana, edu, bea, mix, rev, admin] = await db
    .insert(users)
    .values([
      { email: "ana@ideolab.test", name: "Ana" },
      { email: "edu@ideolab.test", name: "Edu" },
      { email: "bea@ideolab.test", name: "Bea" },
      { email: "mix@ideolab.test", name: "Mix" },
      { email: "rev@ideolab.test", name: "Rev" },
      { email: "admin@ideolab.test", name: "Admin", isAdmin: true },
    ])
    .returning();

  const [clientA, clientB] = await db
    .insert(clients)
    .values([{ name: `Cliente ${MARKER_A}` }, { name: `Cliente ${MARKER_B}` }])
    .returning();

  const [projectA, projectB] = await db
    .insert(projects)
    .values([
      { clientId: clientA.id, name: `Proyecto ${MARKER_A}`, slug: "alfa" },
      { clientId: clientB.id, name: `Proyecto ${MARKER_B}`, slug: "beta" },
    ])
    .returning();

  const [channelA, channelB] = await db
    .insert(channels)
    .values([
      { projectId: projectA.id, kind: "social", platform: "instagram", displayName: `IG ${MARKER_A}`, handle: "@alfa" },
      { projectId: projectB.id, kind: "social", platform: "instagram", displayName: `IG ${MARKER_B}`, handle: "@beta" },
    ])
    .returning();

  await db.insert(projectMemberships).values([
    { projectId: projectA.id, userId: ana.id, role: "manager" },
    { projectId: projectA.id, userId: edu.id, role: "editor" },
    { projectId: projectA.id, userId: rev.id, role: "reviewer" },
    { projectId: projectA.id, userId: mix.id, role: "viewer" },
    { projectId: projectB.id, userId: bea.id, role: "manager" },
    { projectId: projectB.id, userId: mix.id, role: "editor" },
  ]);

  return {
    users: { ana, edu, bea, mix, rev, admin },
    actors: {
      ana: toActor(ana),
      edu: toActor(edu),
      bea: toActor(bea),
      mix: toActor(mix),
      rev: toActor(rev),
      admin: toActor(admin),
    },
    clientA,
    clientB,
    projectA,
    projectB,
    channelA,
    channelB,
  };
}

export type Fixture = Awaited<ReturnType<typeof seedTwoProjects>>;
