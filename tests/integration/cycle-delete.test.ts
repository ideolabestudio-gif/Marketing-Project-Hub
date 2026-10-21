import { and, eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/lib/db/client";
import { auditEvents, contentItems, contentVersions, cycles, metricValues, reports } from "@/lib/db/schema";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { requireProjectAccess, type ProjectContext } from "@/modules/access/context";
import { closeCycle, deleteCycle, getCycleContents, openCycle, reopenCycle } from "@/modules/cycles/service";
import { approveReport, markAiSectionReviewed, updateReportSection } from "@/modules/reports/service";
import { FIXTURE_PERIOD, seedTwoProjects, type Fixture } from "../fixtures/two-projects";

let fx: Fixture;
let ctx: ProjectContext;

beforeEach(async () => {
  fx = await seedTwoProjects();
  ctx = await requireProjectAccess(fx.actors.ana, fx.projectA.id);
});

async function countRows(projectId: string) {
  const db = getDb();
  const [items] = await db.select({ n: sql<number>`count(*)::int` }).from(contentItems).where(eq(contentItems.projectId, projectId));
  const [versions] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(contentVersions)
    .where(eq(contentVersions.projectId, projectId));
  const [values] = await db.select({ n: sql<number>`count(*)::int` }).from(metricValues).where(eq(metricValues.projectId, projectId));
  const [cycleRows] = await db.select({ n: sql<number>`count(*)::int` }).from(cycles).where(eq(cycles.projectId, projectId));
  return { items: items.n, versions: versions.n, values: values.n, cycles: cycleRows.n };
}

describe("eliminar un ciclo", () => {
  it("avisa de lo que se pierde", async () => {
    const c = await getCycleContents(ctx, fx.contentA.cycle.id);
    expect(c.items).toBeGreaterThan(0);
    expect(c.versions).toBeGreaterThan(0);
    expect(c.approvals).toBeGreaterThan(0);
    expect(c.metricValues).toBeGreaterThan(0);
    expect(c.aiGenerations).toBeGreaterThan(0);
  });

  it("borra el ciclo con todo lo suyo, deja el otro proyecto intacto y lo registra en auditoría", async () => {
    const beforeB = await countRows(fx.projectB.id);
    await deleteCycle(ctx, { cycleId: fx.contentA.cycle.id, confirmation: FIXTURE_PERIOD });

    const afterA = await countRows(fx.projectA.id);
    expect(afterA).toEqual({ items: 0, versions: 0, values: 0, cycles: 0 });
    expect(await countRows(fx.projectB.id)).toEqual(beforeB);
    const reportRows = await getDb().select().from(reports).where(eq(reports.projectId, fx.projectA.id));
    expect(reportRows).toHaveLength(0);

    const [event] = await getDb()
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.projectId, fx.projectA.id), eq(auditEvents.action, "cycle.deleted")));
    expect(event.entityId).toBe(fx.contentA.cycle.id);
    expect(event.data).toMatchObject({ period: FIXTURE_PERIOD });

    // El mes se puede volver a abrir desde cero.
    await openCycle(ctx, { period: FIXTURE_PERIOD });
  });

  it("exige escribir el mes para confirmar", async () => {
    await expect(deleteCycle(ctx, { cycleId: fx.contentA.cycle.id, confirmation: "sí" })).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect((await countRows(fx.projectA.id)).cycles).toBe(1);
  });

  it("solo el responsable de cuenta puede eliminarlo", async () => {
    const edu = await requireProjectAccess(fx.actors.edu, fx.projectA.id);
    await expect(
      deleteCycle(edu, { cycleId: fx.contentA.cycle.id, confirmation: FIXTURE_PERIOD }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("no elimina un ciclo de otro proyecto", async () => {
    await expect(
      deleteCycle(ctx, { cycleId: fx.contentB.cycle.id, confirmation: FIXTURE_PERIOD }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("un ciclo cerrado o con el informe aprobado hay que reabrirlo antes", async () => {
    const cycleId = fx.contentA.cycle.id;
    for (const s of fx.metricsA.sections.filter((x) => x.kind === "human_analysis")) {
      await updateReportSection(ctx, { sectionId: s.id, title: s.title, body: "Análisis del equipo" });
    }
    await markAiSectionReviewed(ctx, { sectionId: fx.aiA.aiSection.id });
    await approveReport(ctx, { reportId: fx.metricsA.report.id });
    await expect(deleteCycle(ctx, { cycleId, confirmation: FIXTURE_PERIOD })).rejects.toThrow(/informe/);

    await closeCycle(ctx, { cycleId, learnings: "Funcionaron los reels" });
    await expect(deleteCycle(ctx, { cycleId, confirmation: FIXTURE_PERIOD })).rejects.toThrow(/cerrado/);
    // Segunda barrera en la BD: un ciclo cerrado no se borra ni a mano.
    const deleted = await getDb()
      .delete(cycles)
      .where(eq(cycles.id, cycleId))
      .then(
        () => "",
        (e: Error) => String((e.cause as Error | undefined)?.message ?? e.message),
      );
    expect(deleted).toMatch(/cerrado/);
    await reopenCycle(ctx, { cycleId, reason: "Era de prueba" });
  });

  it("la base de datos sigue rechazando borrar versiones y auditoría fuera del borrado de un ciclo", async () => {
    const dbError = (q: Promise<unknown>) =>
      q.then(
        () => "",
        (e: Error) => String((e.cause as Error | undefined)?.message ?? e.message),
      );
    expect(await dbError(getDb().delete(contentVersions).where(eq(contentVersions.projectId, fx.projectA.id)))).toMatch(
      /inmutable/,
    );
    expect(await dbError(getDb().delete(auditEvents).where(eq(auditEvents.projectId, fx.projectA.id)))).toMatch(
      /inmutable/,
    );
    // Con la marca del borrado de ciclos activa, la auditoría sigue sin poder borrarse.
    let auditError = "";
    await getDb()
      .transaction(async (tx) => {
        await tx.execute(sql`SELECT set_config('mph.cycle_purge', 'x', true)`);
        auditError = await dbError(tx.delete(auditEvents).where(eq(auditEvents.projectId, fx.projectA.id)));
      })
      .catch(() => undefined);
    expect(auditError).toMatch(/inmutable/);
  });
});
