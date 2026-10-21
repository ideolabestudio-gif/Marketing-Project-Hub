import { asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  aiGenerations,
  approvals,
  assets,
  auditEvents,
  brandProfiles,
  channels,
  clients,
  comments,
  contentItems,
  contentVersionAssets,
  contentVersions,
  cycles,
  libraryItems,
  metricDefinitions,
  metricImports,
  metricValues,
  projectMemberships,
  projects,
  publications,
  reportHighlights,
  reports,
  reportSections,
  users,
} from "@/lib/db/schema";
import type { ProjectContext } from "@/modules/access/context";

// Solo lectura, y siempre filtrado por el proyecto del contexto: es la copia completa de
// UN proyecto. El contenido de los archivos se lee aparte (content/service.getAssetFile).

/** Tablas con datos del proyecto que van enteras a la exportación (datos/<nombre>.json). */
export const EXPORTED_TABLES = {
  channels,
  project_memberships: projectMemberships,
  cycles,
  content_items: contentItems,
  content_versions: contentVersions,
  content_version_assets: contentVersionAssets,
  assets,
  comments,
  approvals,
  publications,
  metric_values: metricValues,
  metric_imports: metricImports,
  reports,
  report_sections: reportSections,
  report_highlights: reportHighlights,
  ai_generations: aiGenerations,
  brand_profiles: brandProfiles,
  library_items: libraryItems,
  audit_events: auditEvents,
} as const;

export type ExportedTable = keyof typeof EXPORTED_TABLES;

export async function loadProjectData(ctx: ProjectContext) {
  const db = getDb();
  const tables = Object.fromEntries(
    await Promise.all(
      Object.entries(EXPORTED_TABLES).map(async ([name, table]) => [
        name,
        await db.select().from(table).where(eq(table.projectId, ctx.projectId)),
      ]),
    ),
  ) as { [K in ExportedTable]: (typeof EXPORTED_TABLES)[K]["$inferSelect"][] };

  const [project] = await db
    .select({ project: projects, clientName: clients.name })
    .from(projects)
    .innerJoin(clients, eq(clients.id, projects.clientId))
    .where(eq(projects.id, ctx.projectId));

  // Personas del proyecto: miembros y quien aparece en su auditoría (autores de todo lo demás).
  const actorIds = [
    ...new Set([
      ...tables.project_memberships.map((m) => m.userId),
      ...tables.audit_events.map((e) => e.actorId).filter((id): id is string => Boolean(id)),
    ]),
  ];
  const people = actorIds.length
    ? await db
        .select({ id: users.id, name: users.name, email: users.email })
        .from(users)
        .where(inArray(users.id, actorIds))
    : [];
  const definitions = await db.select().from(metricDefinitions).orderBy(asc(metricDefinitions.key));
  return { ...tables, project: project.project, clientName: project.clientName, people, definitions };
}
