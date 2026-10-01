import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { channels, clients, projects } from "@/lib/db/schema";
import type { ProjectContext } from "@/modules/access/context";

// --- Consultas con ámbito de proyecto: SIEMPRE filtran por ctx.projectId ---

export async function getProjectWithClient(ctx: ProjectContext) {
  const [row] = await getDb()
    .select({
      id: projects.id,
      name: projects.name,
      slug: projects.slug,
      timezone: projects.timezone,
      locale: projects.locale,
      status: projects.status,
      aiEnabled: projects.aiEnabled,
      clientName: clients.name,
    })
    .from(projects)
    .innerJoin(clients, eq(clients.id, projects.clientId))
    .where(eq(projects.id, ctx.projectId))
    .limit(1);
  return row;
}

export async function updateProject(
  ctx: ProjectContext,
  values: Partial<Pick<typeof projects.$inferInsert, "timezone" | "locale">>,
) {
  await getDb().update(projects).set(values).where(eq(projects.id, ctx.projectId));
}

export async function listChannels(ctx: ProjectContext) {
  return getDb()
    .select()
    .from(channels)
    .where(eq(channels.projectId, ctx.projectId))
    .orderBy(asc(channels.kind), asc(channels.displayName));
}

export async function insertChannel(
  ctx: ProjectContext,
  values: Omit<typeof channels.$inferInsert, "projectId" | "id">,
) {
  const [row] = await getDb()
    .insert(channels)
    .values({ ...values, projectId: ctx.projectId })
    .returning();
  return row;
}

export async function updateChannelActive(ctx: ProjectContext, channelId: string, isActive: boolean) {
  const rows = await getDb()
    .update(channels)
    .set({ isActive })
    .where(and(eq(channels.projectId, ctx.projectId), eq(channels.id, channelId)))
    .returning({ id: channels.id });
  return rows.length > 0;
}

// --- Administración (estructura, sin datos de contenido) ---

export async function listClients() {
  return getDb().select().from(clients).orderBy(asc(clients.name));
}

export async function insertClient(values: typeof clients.$inferInsert) {
  const [row] = await getDb().insert(clients).values(values).returning();
  return row;
}

export async function findClient(id: string) {
  const [row] = await getDb().select().from(clients).where(eq(clients.id, id)).limit(1);
  return row;
}

export async function listProjectsWithClient() {
  return getDb()
    .select({
      id: projects.id,
      name: projects.name,
      slug: projects.slug,
      status: projects.status,
      timezone: projects.timezone,
      clientId: clients.id,
      clientName: clients.name,
    })
    .from(projects)
    .innerJoin(clients, eq(clients.id, projects.clientId))
    .orderBy(asc(clients.name), asc(projects.name));
}

export async function findProjectWithClient(projectId: string) {
  const [row] = await getDb()
    .select({
      id: projects.id,
      name: projects.name,
      status: projects.status,
      timezone: projects.timezone,
      clientName: clients.name,
    })
    .from(projects)
    .innerJoin(clients, eq(clients.id, projects.clientId))
    .where(eq(projects.id, projectId))
    .limit(1);
  return row;
}

export async function insertProject(values: typeof projects.$inferInsert) {
  const [row] = await getDb().insert(projects).values(values).returning();
  return row;
}

export async function setProjectStatus(projectId: string, status: "active" | "archived") {
  const rows = await getDb()
    .update(projects)
    .set({ status })
    .where(eq(projects.id, projectId))
    .returning({ id: projects.id });
  return rows.length > 0;
}
