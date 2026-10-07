import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { aiGenerations, users } from "@/lib/db/schema";
import type { ProjectContext } from "@/modules/access/context";

export type GenerationRow = typeof aiGenerations.$inferSelect;
export type NewGeneration = Omit<
  typeof aiGenerations.$inferInsert,
  "id" | "projectId" | "requestedBy" | "createdAt" | "resolvedBy" | "resolvedAt"
>;

export async function insertGeneration(ctx: ProjectContext, values: NewGeneration): Promise<GenerationRow> {
  const [row] = await getDb()
    .insert(aiGenerations)
    .values({ ...values, projectId: ctx.projectId, requestedBy: ctx.actor.userId })
    .returning();
  return row;
}

export async function findGeneration(ctx: ProjectContext, id: string): Promise<GenerationRow | undefined> {
  const [row] = await getDb()
    .select()
    .from(aiGenerations)
    .where(and(eq(aiGenerations.projectId, ctx.projectId), eq(aiGenerations.id, id)))
    .limit(1);
  return row;
}

/** Generaciones de un ciclo (de una pieza o, sin pieza, las del ciclo para ese fin). */
export async function listGenerations(
  ctx: ProjectContext,
  filter: { cycleId: string; contentItemId?: string; purpose?: GenerationRow["purpose"] },
) {
  return getDb()
    .select({ generation: aiGenerations, requestedByName: users.name, requestedByEmail: users.email })
    .from(aiGenerations)
    .innerJoin(users, eq(users.id, aiGenerations.requestedBy))
    .where(
      and(
        eq(aiGenerations.projectId, ctx.projectId),
        eq(aiGenerations.cycleId, filter.cycleId),
        filter.contentItemId ? eq(aiGenerations.contentItemId, filter.contentItemId) : isNull(aiGenerations.contentItemId),
        filter.purpose ? eq(aiGenerations.purpose, filter.purpose) : undefined,
      ),
    )
    .orderBy(desc(aiGenerations.createdAt))
    .limit(30);
}

/** Pasa una generación de borrador a usada o descartada (una sola vez). */
export async function resolveGeneration(
  ctx: ProjectContext,
  id: string,
  status: "used" | "discarded",
): Promise<boolean> {
  const rows = await getDb()
    .update(aiGenerations)
    .set({ status, resolvedBy: ctx.actor.userId, resolvedAt: new Date() })
    .where(and(eq(aiGenerations.projectId, ctx.projectId), eq(aiGenerations.id, id), eq(aiGenerations.status, "draft")))
    .returning({ id: aiGenerations.id });
  return rows.length > 0;
}

/** Gasto de IA del proyecto desde una fecha (USD). */
export async function spentSince(ctx: ProjectContext, since: Date): Promise<number> {
  const [row] = await getDb()
    .select({ total: sql<string>`coalesce(sum(${aiGenerations.costUsd}), 0)` })
    .from(aiGenerations)
    .where(and(eq(aiGenerations.projectId, ctx.projectId), gte(aiGenerations.createdAt, since)));
  return Number(row.total);
}
