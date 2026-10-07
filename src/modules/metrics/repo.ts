import { and, asc, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { metricDefinitions, metricImports, metricValues, users } from "@/lib/db/schema";
import type { ProjectContext } from "@/modules/access/context";

// Escribe en metric_values y metric_imports (datos de proyecto, siempre con ctx) y en
// metric_definitions (catálogo global, solo desde servicios de administración).

export type DefinitionRow = typeof metricDefinitions.$inferSelect;
export type ImportRow = typeof metricImports.$inferSelect;
export type ValueRow = typeof metricValues.$inferSelect;

// --- Catálogo ---

export async function listDefinitions(opts: { activeOnly?: boolean } = {}): Promise<DefinitionRow[]> {
  return getDb()
    .select()
    .from(metricDefinitions)
    .where(opts.activeOnly ? eq(metricDefinitions.isActive, true) : undefined)
    .orderBy(asc(metricDefinitions.kind), asc(metricDefinitions.position), asc(metricDefinitions.label));
}

export async function findDefinition(key: string): Promise<DefinitionRow | undefined> {
  const [row] = await getDb().select().from(metricDefinitions).where(eq(metricDefinitions.key, key)).limit(1);
  return row;
}

export async function insertDefinition(values: typeof metricDefinitions.$inferInsert): Promise<void> {
  await getDb().insert(metricDefinitions).values(values);
}

export async function updateDefinition(
  key: string,
  values: Partial<Pick<DefinitionRow, "label" | "description" | "sourceNote" | "defaultAggregation" | "position" | "isActive">>,
): Promise<boolean> {
  const rows = await getDb()
    .update(metricDefinitions)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(metricDefinitions.key, key))
    .returning({ key: metricDefinitions.key });
  return rows.length > 0;
}

// --- Valores (con ámbito de proyecto) ---

/** Todos los valores de un ciclo (incluidos los corregidos), con quién los registró. */
export async function listValuesForCycle(ctx: ProjectContext, cycleId: string) {
  const db = getDb();
  const superseded = db
    .select({ id: metricValues.supersedesId })
    .from(metricValues)
    .where(and(eq(metricValues.projectId, ctx.projectId), isNotNull(metricValues.supersedesId)));
  return db
    .select({
      value: metricValues,
      isCurrent: sql<boolean>`${metricValues.id} NOT IN (${superseded})`,
      capturedByName: users.name,
      capturedByEmail: users.email,
    })
    .from(metricValues)
    .innerJoin(users, eq(users.id, metricValues.capturedBy))
    .where(and(eq(metricValues.projectId, ctx.projectId), eq(metricValues.cycleId, cycleId)))
    .orderBy(asc(metricValues.channelId), asc(metricValues.metricKey), desc(metricValues.capturedAt));
}

/** Valores vigentes (no corregidos) de varios ciclos del proyecto, a nivel de canal. */
export async function currentChannelValues(ctx: ProjectContext, cycleIds: string[]) {
  if (cycleIds.length === 0) return [];
  const db = getDb();
  const superseded = db
    .select({ id: metricValues.supersedesId })
    .from(metricValues)
    .where(and(eq(metricValues.projectId, ctx.projectId), isNotNull(metricValues.supersedesId)));
  return db
    .select({
      cycleId: metricValues.cycleId,
      channelId: metricValues.channelId,
      metricKey: metricValues.metricKey,
      value: metricValues.value,
      source: metricValues.source,
    })
    .from(metricValues)
    .where(
      and(
        eq(metricValues.projectId, ctx.projectId),
        inArray(metricValues.cycleId, cycleIds),
        sql`${metricValues.contentItemId} IS NULL`,
        sql`${metricValues.id} NOT IN (${superseded})`,
      ),
    );
}

export type NewValue = {
  cycleId: string;
  channelId: string;
  metricKey: string;
  value: number;
  source: "manual" | "csv_import";
  importId: string | null;
  sourceDetail: string | null;
  note: string | null;
};

/**
 * Inserta valores en una transacción. Si ya hay un valor vigente para el mismo ciclo,
 * canal y métrica, el nuevo lo corrige (supersedes_id); el antiguo se conserva.
 * Un bloqueo por (ciclo, canal, métrica) evita dos valores vigentes a la vez.
 */
export async function insertValues(
  ctx: ProjectContext,
  values: NewValue[],
  opts: { resolveImportId?: string } = {},
): Promise<ValueRow[]> {
  return getDb().transaction(async (tx) => {
    const inserted: ValueRow[] = [];
    for (const v of values) {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`${v.cycleId}|${v.channelId}|${v.metricKey}`}))`);
      const [current] = await tx
        .select({ id: metricValues.id })
        .from(metricValues)
        .where(
          and(
            eq(metricValues.projectId, ctx.projectId),
            eq(metricValues.cycleId, v.cycleId),
            eq(metricValues.channelId, v.channelId),
            eq(metricValues.metricKey, v.metricKey),
            sql`${metricValues.contentItemId} IS NULL`,
            sql`NOT EXISTS (SELECT 1 FROM metric_values s WHERE s.supersedes_id = ${metricValues.id})`,
          ),
        )
        .limit(1);
      const [row] = await tx
        .insert(metricValues)
        .values({ ...v, projectId: ctx.projectId, supersedesId: current?.id ?? null, capturedBy: ctx.actor.userId })
        .returning();
      inserted.push(row);
    }
    if (opts.resolveImportId) {
      const resolved = await tx
        .update(metricImports)
        .set({ status: "applied", resolvedBy: ctx.actor.userId, resolvedAt: new Date() })
        .where(
          and(
            eq(metricImports.projectId, ctx.projectId),
            eq(metricImports.id, opts.resolveImportId),
            eq(metricImports.status, "pending"),
          ),
        )
        .returning({ id: metricImports.id });
      if (resolved.length === 0) throw new Error("La importación ya no está pendiente");
    }
    return inserted;
  });
}

// --- Importaciones ---

export async function insertImport(
  ctx: ProjectContext,
  values: Pick<ImportRow, "cycleId" | "channelId" | "filename" | "rawCsv" | "rowCount">,
): Promise<ImportRow> {
  const [row] = await getDb()
    .insert(metricImports)
    .values({ ...values, projectId: ctx.projectId, uploadedBy: ctx.actor.userId })
    .returning();
  return row;
}

export async function findImport(ctx: ProjectContext, importId: string): Promise<ImportRow | undefined> {
  const [row] = await getDb()
    .select()
    .from(metricImports)
    .where(and(eq(metricImports.projectId, ctx.projectId), eq(metricImports.id, importId)))
    .limit(1);
  return row;
}

export async function listImportsForCycle(ctx: ProjectContext, cycleId: string) {
  return getDb()
    .select({
      id: metricImports.id,
      channelId: metricImports.channelId,
      filename: metricImports.filename,
      rowCount: metricImports.rowCount,
      status: metricImports.status,
      createdAt: metricImports.createdAt,
    })
    .from(metricImports)
    .where(and(eq(metricImports.projectId, ctx.projectId), eq(metricImports.cycleId, cycleId)))
    .orderBy(desc(metricImports.createdAt));
}

export async function discardImport(ctx: ProjectContext, importId: string): Promise<boolean> {
  const rows = await getDb()
    .update(metricImports)
    .set({ status: "discarded", resolvedBy: ctx.actor.userId, resolvedAt: new Date() })
    .where(
      and(eq(metricImports.projectId, ctx.projectId), eq(metricImports.id, importId), eq(metricImports.status, "pending")),
    )
    .returning({ id: metricImports.id });
  return rows.length > 0;
}
