import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { cycles } from "@/lib/db/schema";
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
  values: Partial<Pick<CycleRow, "objectives" | "keyDates" | "notes" | "status">>,
): Promise<void> {
  await getDb()
    .update(cycles)
    .set(values)
    .where(and(eq(cycles.projectId, ctx.projectId), eq(cycles.id, cycleId)));
}
