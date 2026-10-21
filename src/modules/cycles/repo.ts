import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { cycles, reports } from "@/lib/db/schema";
import type { ProjectContext } from "@/modules/access/context";

export type CycleRow = typeof cycles.$inferSelect;

export async function listCycles(ctx: ProjectContext): Promise<CycleRow[]> {
  return getDb().select().from(cycles).where(eq(cycles.projectId, ctx.projectId)).orderBy(desc(cycles.period));
}

export async function findCycleById(ctx: ProjectContext, cycleId: string): Promise<CycleRow | undefined> {
  const [row] = await getDb()
    .select()
    .from(cycles)
    .where(and(eq(cycles.projectId, ctx.projectId), eq(cycles.id, cycleId)))
    .limit(1);
  return row;
}

export async function findCycleByPeriod(ctx: ProjectContext, period: string): Promise<CycleRow | undefined> {
  const [row] = await getDb()
    .select()
    .from(cycles)
    .where(and(eq(cycles.projectId, ctx.projectId), eq(cycles.period, period)))
    .limit(1);
  return row;
}

export async function insertCycle(ctx: ProjectContext, period: string): Promise<CycleRow> {
  const [row] = await getDb()
    .insert(cycles)
    .values({ projectId: ctx.projectId, period, createdBy: ctx.actor.userId })
    .returning();
  return row;
}

export async function updateCycle(
  ctx: ProjectContext,
  cycleId: string,
  values: Partial<
    Pick<CycleRow, "objectives" | "keyDates" | "notes" | "status" | "learnings" | "closedAt" | "closedBy">
  >,
): Promise<void> {
  await getDb()
    .update(cycles)
    .set(values)
    .where(and(eq(cycles.projectId, ctx.projectId), eq(cycles.id, cycleId)));
}

/** Lectura (JOIN de solo lectura a reports): ¿tiene el ciclo un informe aprobado? */
export async function hasApprovedReport(ctx: ProjectContext, cycleId: string): Promise<boolean> {
  const [row] = await getDb()
    .select({ id: reports.id })
    .from(reports)
    .where(and(eq(reports.projectId, ctx.projectId), eq(reports.cycleId, cycleId), eq(reports.status, "approved")))
    .limit(1);
  return Boolean(row);
}

export type CycleContents = {
  items: number;
  versions: number;
  approvals: number;
  publications: number;
  comments: number;
  aiGenerations: number;
  metricValues: number;
  metricImports: number;
  hasReport: boolean;
};

/** Lectura: cuánto se perdería al eliminar el ciclo. */
export async function countCycleContents(ctx: ProjectContext, cycleId: string): Promise<CycleContents> {
  const p = ctx.projectId;
  const items = sql`SELECT id FROM content_items WHERE project_id = ${p} AND cycle_id = ${cycleId}`;
  const [row] = await getDb().execute<Record<keyof CycleContents, string | boolean>>(sql`
    SELECT
      (SELECT count(*) FROM content_items WHERE project_id = ${p} AND cycle_id = ${cycleId}) AS "items",
      (SELECT count(*) FROM content_versions WHERE project_id = ${p} AND content_item_id IN (${items})) AS "versions",
      (SELECT count(*) FROM approvals WHERE project_id = ${p} AND content_item_id IN (${items})
         AND decision = 'approved') AS "approvals",
      (SELECT count(*) FROM publications WHERE project_id = ${p} AND content_item_id IN (${items})
         AND status <> 'cancelled') AS "publications",
      (SELECT count(*) FROM comments WHERE project_id = ${p} AND content_item_id IN (${items})) AS "comments",
      (SELECT count(*) FROM ai_generations WHERE project_id = ${p} AND cycle_id = ${cycleId}) AS "aiGenerations",
      (SELECT count(*) FROM metric_values WHERE project_id = ${p} AND cycle_id = ${cycleId}) AS "metricValues",
      (SELECT count(*) FROM metric_imports WHERE project_id = ${p} AND cycle_id = ${cycleId}) AS "metricImports",
      EXISTS (SELECT 1 FROM reports WHERE project_id = ${p} AND cycle_id = ${cycleId}) AS "hasReport"
  `);
  return {
    items: Number(row.items),
    versions: Number(row.versions),
    approvals: Number(row.approvals),
    publications: Number(row.publications),
    comments: Number(row.comments),
    aiGenerations: Number(row.aiGenerations),
    metricValues: Number(row.metricValues),
    metricImports: Number(row.metricImports),
    hasReport: Boolean(row.hasReport),
  };
}

/**
 * Borra el ciclo y todo lo que cuelga de él, en una transacción. La marca mph.cycle_purge
 * (SET LOCAL, solo dura esta transacción) es lo único que permite a los triggers de
 * inmutabilidad aceptar el DELETE (migración 0018); la auditoría sigue sin poder borrarse.
 * Los archivos se borran solo si no los usa ninguna otra versión ni la biblioteca de marca.
 */
export async function purgeCycle(ctx: ProjectContext, cycleId: string): Promise<void> {
  const p = ctx.projectId;
  await getDb().transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('mph.cycle_purge', ${cycleId}, true)`);
    const items = sql`SELECT id FROM content_items WHERE project_id = ${p} AND cycle_id = ${cycleId}`;
    const versions = sql`SELECT id FROM content_versions WHERE project_id = ${p} AND content_item_id IN (${items})`;
    const orphanAssets = await tx.execute<{ asset_id: string }>(sql`
      SELECT DISTINCT cva.asset_id FROM content_version_assets cva
      WHERE cva.project_id = ${p} AND cva.content_version_id IN (${versions})
        AND NOT EXISTS (SELECT 1 FROM content_version_assets o
                        WHERE o.project_id = ${p} AND o.asset_id = cva.asset_id
                          AND o.content_version_id NOT IN (${versions}))
        AND NOT EXISTS (SELECT 1 FROM library_items l WHERE l.project_id = ${p} AND l.asset_id = cva.asset_id)
    `);
    const assetIds = orphanAssets.map((r) => r.asset_id);

    // Informe (secciones y cifras destacadas caen en cascada) y métricas del mes.
    await tx.execute(sql`DELETE FROM reports WHERE project_id = ${p} AND cycle_id = ${cycleId}`);
    await tx.execute(sql`DELETE FROM metric_values WHERE project_id = ${p} AND cycle_id = ${cycleId}`);
    await tx.execute(sql`DELETE FROM metric_imports WHERE project_id = ${p} AND cycle_id = ${cycleId}`);
    // Piezas: lo que cuelga de cada versión, las versiones, los borradores de IA de cada
    // pieza, las piezas y, al final, el resto de generaciones del ciclo (propuestas de calendario).
    await tx.execute(sql`DELETE FROM publications WHERE project_id = ${p} AND content_item_id IN (${items})`);
    await tx.execute(sql`DELETE FROM approvals WHERE project_id = ${p} AND content_item_id IN (${items})`);
    await tx.execute(sql`DELETE FROM comments WHERE project_id = ${p} AND content_item_id IN (${items})`);
    await tx.execute(sql`DELETE FROM content_version_assets WHERE project_id = ${p} AND content_version_id IN (${versions})`);
    await tx.execute(sql`DELETE FROM content_versions WHERE project_id = ${p} AND content_item_id IN (${items})`);
    await tx.execute(
      sql`DELETE FROM ai_generations WHERE project_id = ${p} AND cycle_id = ${cycleId} AND content_item_id IS NOT NULL`,
    );
    await tx.execute(sql`DELETE FROM content_items WHERE project_id = ${p} AND cycle_id = ${cycleId}`);
    await tx.execute(sql`DELETE FROM ai_generations WHERE project_id = ${p} AND cycle_id = ${cycleId}`);
    if (assetIds.length > 0) {
      const ids = sql.join(
        assetIds.map((id) => sql`${id}::uuid`),
        sql`, `,
      );
      await tx.execute(sql`DELETE FROM asset_files WHERE project_id = ${p} AND asset_id IN (${ids})`);
      await tx.execute(sql`DELETE FROM assets WHERE project_id = ${p} AND id IN (${ids})`);
    }
    await tx.delete(cycles).where(and(eq(cycles.projectId, p), eq(cycles.id, cycleId)));
  });
}
