import { and, desc, eq, like, notLike, or, sql, type SQL } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { auditEvents, contentItems, cycles, users } from "@/lib/db/schema";
import type { ProjectContext } from "@/modules/access/context";

// Solo lectura del registro de auditoría de UN proyecto (el del contexto). Las piezas y
// los meses se cruzan también filtrando por el proyecto, para enlazarlos.

const itemIdOf = sql`coalesce(${auditEvents.data} ->> 'itemId', CASE WHEN ${auditEvents.entityType} = 'content_item' THEN ${auditEvents.entityId} END)`;

export async function listEvents(
  ctx: ProjectContext,
  opts: { prefixes: string[] | null; exclude?: string[]; before: { at: Date; id: string } | null; limit: number },
) {
  const conditions: (SQL | undefined)[] = [eq(auditEvents.projectId, ctx.projectId)];
  if (opts.prefixes) conditions.push(or(...opts.prefixes.map((p) => like(auditEvents.action, `${p}%`))));
  for (const p of opts.exclude ?? []) conditions.push(notLike(auditEvents.action, `${p}%`));
  if (opts.before) {
    conditions.push(sql`(${auditEvents.createdAt}, ${auditEvents.id}) < (${opts.before.at.toISOString()}::timestamptz, ${opts.before.id}::uuid)`);
  }
  return getDb()
    .select({
      id: auditEvents.id,
      action: auditEvents.action,
      entityType: auditEvents.entityType,
      data: auditEvents.data,
      createdAt: auditEvents.createdAt,
      actorName: users.name,
      actorEmail: users.email,
      itemId: contentItems.id,
      itemTitle: contentItems.title,
      period: cycles.period,
    })
    .from(auditEvents)
    .leftJoin(users, eq(users.id, auditEvents.actorId))
    .leftJoin(
      contentItems,
      and(eq(contentItems.projectId, ctx.projectId), sql`${contentItems.id}::text = ${itemIdOf}`),
    )
    .leftJoin(
      cycles,
      and(
        eq(cycles.projectId, ctx.projectId),
        sql`${cycles.id}::text = coalesce(${contentItems.cycleId}::text, CASE WHEN ${auditEvents.entityType} = 'cycle' THEN ${auditEvents.entityId} END)`,
      ),
    )
    .where(and(...conditions))
    .orderBy(desc(auditEvents.createdAt), desc(auditEvents.id))
    .limit(opts.limit);
}

