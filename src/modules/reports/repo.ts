import { and, asc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { reportSections, reports } from "@/lib/db/schema";
import type { ProjectContext } from "@/modules/access/context";

export type ReportRow = typeof reports.$inferSelect;
export type SectionRow = typeof reportSections.$inferSelect;

export async function findReportByCycle(ctx: ProjectContext, cycleId: string): Promise<ReportRow | undefined> {
  const [row] = await getDb()
    .select()
    .from(reports)
    .where(and(eq(reports.projectId, ctx.projectId), eq(reports.cycleId, cycleId)))
    .limit(1);
  return row;
}

export async function findReport(ctx: ProjectContext, reportId: string): Promise<ReportRow | undefined> {
  const [row] = await getDb()
    .select()
    .from(reports)
    .where(and(eq(reports.projectId, ctx.projectId), eq(reports.id, reportId)))
    .limit(1);
  return row;
}

export async function listSections(ctx: ProjectContext, reportId: string): Promise<SectionRow[]> {
  return getDb()
    .select()
    .from(reportSections)
    .where(and(eq(reportSections.projectId, ctx.projectId), eq(reportSections.reportId, reportId)))
    .orderBy(asc(reportSections.position));
}

export async function findSection(ctx: ProjectContext, sectionId: string): Promise<SectionRow | undefined> {
  const [row] = await getDb()
    .select()
    .from(reportSections)
    .where(and(eq(reportSections.projectId, ctx.projectId), eq(reportSections.id, sectionId)))
    .limit(1);
  return row;
}

type NewSection = Pick<SectionRow, "kind" | "title" | "body" | "channelId" | "comparePrevious"> &
  Partial<Pick<SectionRow, "aiGenerationId">>;

export async function createReportWithSections(
  ctx: ProjectContext,
  cycleId: string,
  sections: NewSection[],
): Promise<ReportRow> {
  return getDb().transaction(async (tx) => {
    const [report] = await tx
      .insert(reports)
      .values({ projectId: ctx.projectId, cycleId, createdBy: ctx.actor.userId })
      .returning();
    if (sections.length > 0) {
      await tx.insert(reportSections).values(
        sections.map((s, i) => ({ ...s, projectId: ctx.projectId, reportId: report.id, position: (i + 1) * 10 })),
      );
    }
    return report;
  });
}

export async function insertSection(ctx: ProjectContext, reportId: string, section: NewSection): Promise<SectionRow> {
  const [{ max }] = await getDb()
    .select({ max: sql<number>`coalesce(max(${reportSections.position}), 0)` })
    .from(reportSections)
    .where(and(eq(reportSections.projectId, ctx.projectId), eq(reportSections.reportId, reportId)));
  const [row] = await getDb()
    .insert(reportSections)
    .values({ ...section, projectId: ctx.projectId, reportId, position: Number(max) + 10 })
    .returning();
  return row;
}

export async function updateSection(
  ctx: ProjectContext,
  sectionId: string,
  values: Partial<
    Pick<SectionRow, "title" | "body" | "channelId" | "comparePrevious" | "position" | "reviewedBy" | "reviewedAt">
  >,
): Promise<void> {
  await getDb()
    .update(reportSections)
    .set({ ...values, updatedAt: new Date() })
    .where(and(eq(reportSections.projectId, ctx.projectId), eq(reportSections.id, sectionId)));
}

export async function deleteSection(ctx: ProjectContext, sectionId: string): Promise<void> {
  await getDb()
    .delete(reportSections)
    .where(and(eq(reportSections.projectId, ctx.projectId), eq(reportSections.id, sectionId)));
}

export async function swapPositions(ctx: ProjectContext, a: SectionRow, b: SectionRow): Promise<void> {
  await getDb().transaction(async (tx) => {
    const where = (id: string) => and(eq(reportSections.projectId, ctx.projectId), eq(reportSections.id, id));
    await tx.update(reportSections).set({ position: b.position }).where(where(a.id));
    await tx.update(reportSections).set({ position: a.position }).where(where(b.id));
  });
}

export async function updateReport(
  ctx: ProjectContext,
  reportId: string,
  values: Partial<Pick<ReportRow, "status" | "approvedBy" | "approvedAt">>,
): Promise<void> {
  await getDb()
    .update(reports)
    .set({ ...values, updatedAt: new Date() })
    .where(and(eq(reports.projectId, ctx.projectId), eq(reports.id, reportId)));
}
