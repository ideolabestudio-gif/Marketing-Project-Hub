import { eq } from "drizzle-orm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import { ReportBody } from "@/components/report-body";
import { getDb } from "@/lib/db/client";
import { formatMetric } from "@/lib/format";
import { metricImports, metricValues, reportSections } from "@/lib/db/schema";
import { ForbiddenError, ValidationError } from "@/lib/errors";
import { requireProjectAccess, type ProjectContext } from "@/modules/access/context";
import { closeCycle, openCycle, reopenCycle } from "@/modules/cycles/service";
import {
  adminCreateMetricDefinition,
  adminUpdateMetricDefinition,
  applyMetricImport,
  discardMetricImport,
  getCycleMetrics,
  getMetricImport,
  getMetricSummary,
  listMetricCatalog,
  recordMetricValue,
  uploadMetricCsv,
} from "@/modules/metrics/service";
import { findDefinition } from "@/modules/metrics/repo";
import {
  addReportSection,
  approveReport,
  getReportView,
  markAiSectionReviewed,
  reopenReport,
  updateReportSection,
} from "@/modules/reports/service";
import { MARKER_B, seedTwoProjects, type Fixture } from "../fixtures/two-projects";

let fx: Fixture;
let ctx: ProjectContext;

beforeEach(async () => {
  fx = await seedTwoProjects();
  ctx = await requireProjectAccess(fx.actors.ana, fx.projectA.id);
});

async function pgCode(promise: Promise<unknown>): Promise<string | undefined> {
  const err = await promise.then(
    () => null,
    (e: { code?: string; cause?: { code?: string } }) => e,
  );
  expect(err, "se esperaba un error de la base de datos").not.toBeNull();
  return err?.cause?.code ?? err?.code;
}

async function fillAnalysisAndApprove() {
  for (const s of fx.metricsA.sections.filter((x) => x.kind === "human_analysis")) {
    await updateReportSection(ctx, { sectionId: s.id, title: s.title, body: "Análisis del equipo" });
  }
  await markAiSectionReviewed(ctx, { sectionId: fx.aiA.aiSection.id });
  await approveReport(ctx, { reportId: fx.metricsA.report.id });
}

const cycleA = () => fx.contentA.cycle.id;
const channelA = () => fx.channelA.id;

describe("registro de métricas", () => {
  it("cada valor guarda su fuente y quién lo registró; una corrección conserva el valor anterior", async () => {
    const { values } = await getCycleMetrics(ctx, cycleA());
    const followers = values.filter((v) => v.metricKey === "social.followers");
    expect(followers).toHaveLength(2);
    const current = followers.find((v) => v.isCurrent)!;
    const old = followers.find((v) => !v.isCurrent)!;
    expect(current.value).toBe(1250);
    expect(current.source).toBe("manual");
    expect(current.capturedByName).toBeTruthy();
    expect(current.supersedesId).toBe(old.id);
    expect(old.value).toBe(1200);
  });

  it("corregir exige un motivo; los valores se validan según la unidad y el tipo de canal", async () => {
    const base = { cycleId: cycleA(), channelId: channelA() };
    await expect(recordMetricValue(ctx, { ...base, metricKey: "social.followers", value: "1300" })).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(recordMetricValue(ctx, { ...base, metricKey: "social.engagement_rate", value: "140" })).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(recordMetricValue(ctx, { ...base, metricKey: "email.opens", value: "10" })).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(recordMetricValue(ctx, { ...base, metricKey: "social.reach", value: "mucho" })).rejects.toBeInstanceOf(
      ValidationError,
    );
    const row = await recordMetricValue(ctx, { ...base, metricKey: "social.reach", value: "12.345,5" });
    expect(row.value).toBe(12345.5);
  });

  it("solo quien tiene metrics.write registra métricas", async () => {
    const mix = await requireProjectAccess(fx.actors.mix, fx.projectA.id); // viewer en A
    await expect(
      recordMetricValue(mix, { cycleId: cycleA(), channelId: channelA(), metricKey: "social.reach", value: "1" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    const edu = await requireProjectAccess(fx.actors.edu, fx.projectA.id); // editor
    await expect(
      recordMetricValue(edu, { cycleId: cycleA(), channelId: channelA(), metricKey: "social.reach", value: "1" }),
    ).resolves.toBeTruthy();
  });

  it("los valores son inmutables y no pueden apuntar a otro proyecto (DB-04, DB-07)", async () => {
    const id = fx.metricsA.followersValueId;
    expect(await pgCode(getDb().update(metricValues).set({ value: 1 }).where(eq(metricValues.id, id)))).toBe("42501");
    expect(await pgCode(getDb().delete(metricValues).where(eq(metricValues.id, id)))).toBe("42501");
    const base = {
      projectId: fx.projectA.id,
      metricKey: "social.reach",
      value: 1,
      source: "manual" as const,
      capturedBy: fx.users.ana.id,
    };
    expect(await pgCode(getDb().insert(metricValues).values({ ...base, cycleId: cycleA(), channelId: fx.channelB.id }))).toBe(
      "23503",
    );
    expect(
      await pgCode(getDb().insert(metricValues).values({ ...base, cycleId: fx.contentB.cycle.id, channelId: channelA() })),
    ).toBe("23503");
    // Un valor "importado" sin importación (o al revés) lo rechaza un CHECK.
    expect(
      await pgCode(getDb().insert(metricValues).values({ ...base, cycleId: cycleA(), channelId: channelA(), source: "csv_import" })),
    ).toBe("23514");
  });
});

describe("importación CSV genérica", () => {
  it("propone columnas y formato, y aplica sumas y última fila dejando constancia del cálculo", async () => {
    const preview = await getMetricImport(ctx, fx.metricsA.csvImport.id);
    expect(preview.headers).toEqual(["Fecha", "Alcance", "Seguidores", "Nota"]);
    expect(preview.suggestedFormat).toBe("es");
    const suggested = Object.fromEntries(preview.suggestions.map((s) => [s.definition.key, s.column]));
    expect(suggested["social.reach"]).toBe(1);
    expect(suggested["social.followers"]).toBe(2);
    expect(suggested["social.impressions"]).toBeNull();

    await applyMetricImport(ctx, {
      importId: fx.metricsA.csvImport.id,
      numberFormat: "es",
      mappings: [
        { metricKey: "social.reach", column: 1, aggregation: "sum" },
        { metricKey: "social.followers", column: 2, aggregation: "last" },
      ],
    });
    const { values, imports } = await getCycleMetrics(ctx, cycleA());
    const current = values.filter((v) => v.isCurrent);
    const reach = current.find((v) => v.metricKey === "social.reach")!;
    expect(reach.value).toBe(1500);
    expect(reach.source).toBe("csv_import");
    expect(reach.importId).toBe(fx.metricsA.csvImport.id);
    expect(reach.sourceDetail).toContain("columna «Alcance»");
    expect(reach.sourceDetail).toContain("2 filas");
    // El CSV corrige el valor manual de seguidores sin borrarlo.
    expect(values.filter((v) => v.metricKey === "social.followers")).toHaveLength(3);
    expect(current.find((v) => v.metricKey === "social.followers")!.value).toBe(1250);
    expect(imports[0].status).toBe("applied");

    await expect(
      applyMetricImport(ctx, {
        importId: fx.metricsA.csvImport.id,
        numberFormat: "es",
        mappings: [{ metricKey: "social.reach", column: 1, aggregation: "sum" }],
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(discardMetricImport(ctx, { importId: fx.metricsA.csvImport.id })).rejects.toBeInstanceOf(ValidationError);
  });

  it("una columna no numérica se rechaza entera, sin aplicar nada", async () => {
    await expect(
      applyMetricImport(ctx, {
        importId: fx.metricsA.csvImport.id,
        numberFormat: "es",
        mappings: [
          { metricKey: "social.reach", column: 1, aggregation: "sum" },
          { metricKey: "social.posts", column: 3, aggregation: "sum" },
        ],
      }),
    ).rejects.toThrow(/no es un número/);
    const { values, imports } = await getCycleMetrics(ctx, cycleA());
    expect(values.some((v) => v.metricKey === "social.reach")).toBe(false);
    expect(imports.find((i) => i.id === fx.metricsA.csvImport.id)!.status).toBe("pending");
  });

  it("el archivo original no se puede modificar ni borrar", async () => {
    const id = fx.metricsA.csvImport.id;
    expect(await pgCode(getDb().update(metricImports).set({ rawCsv: "x" }).where(eq(metricImports.id, id)))).toBe("42501");
    expect(await pgCode(getDb().delete(metricImports).where(eq(metricImports.id, id)))).toBe("42501");
    await discardMetricImport(ctx, { importId: id });
    expect(
      await pgCode(getDb().update(metricImports).set({ status: "pending" }).where(eq(metricImports.id, id))),
    ).toBe("42501");
  });

  it("rechaza archivos vacíos o sin filas", async () => {
    await expect(
      uploadMetricCsv(ctx, { cycleId: cycleA(), channelId: channelA(), filename: "v.csv", text: "" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("resumen e informe", () => {
  it("compara con el mes anterior y nunca rellena lo que falta (WF-07)", async () => {
    const sept = await openCycle(ctx, { period: "2026-09" });
    await recordMetricValue(ctx, { cycleId: sept.id, channelId: channelA(), metricKey: "social.followers", value: "1000" });
    const [summary] = await getMetricSummary(ctx, { cycleId: cycleA(), channelId: channelA() });
    expect(summary.hasPrevious).toBe(true);
    const followers = summary.rows.find((r) => r.definition.key === "social.followers")!;
    expect(followers).toMatchObject({ value: 1250, previous: 1000, change: 25, source: "manual" });
    const reach = summary.rows.find((r) => r.definition.key === "social.reach")!;
    expect(reach).toMatchObject({ value: null, previous: null, change: null, source: null });
  });

  it("el informe pinta «sin dato» y solo datos del proyecto (WF-07, EX-01)", async () => {
    const html = renderToStaticMarkup(createElement(ReportBody, { view: await getReportView(ctx, cycleA()) }));
    expect(html).toContain("sin dato");
    expect(html).toContain(`>${formatMetric(1250, "count")}<`);
    expect(html).toContain("Resumen ALFA-SECRET");
    expect(html).toContain("BORRADOR");
    expect(html).not.toContain(MARKER_B);
  });

  it("no se aprueba con análisis vacío; aprobado queda bloqueado (también en BD) hasta reabrirlo", async () => {
    await expect(approveReport(ctx, { reportId: fx.metricsA.report.id })).rejects.toThrow(/Conclusiones/);
    await fillAnalysisAndApprove();
    const section = fx.metricsA.sections[0];
    await expect(updateReportSection(ctx, { sectionId: section.id, title: "Otro" })).rejects.toBeInstanceOf(ValidationError);
    await expect(
      addReportSection(ctx, { reportId: fx.metricsA.report.id, kind: "human_analysis", title: "Más", body: "x" }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(
      await pgCode(getDb().update(reportSections).set({ body: "x" }).where(eq(reportSections.id, section.id))),
    ).toBe("42501");
    expect(await pgCode(getDb().delete(reportSections).where(eq(reportSections.id, section.id)))).toBe("42501");

    await reopenReport(ctx, { reportId: fx.metricsA.report.id, reason: "Añadir dato" });
    await expect(updateReportSection(ctx, { sectionId: section.id, title: "Otro", body: "Nuevo" })).resolves.toBeUndefined();
  });

  it("aprueba quien tiene report.approve; el editor redacta pero no aprueba", async () => {
    const edu = await requireProjectAccess(fx.actors.edu, fx.projectA.id);
    const rev = await requireProjectAccess(fx.actors.rev, fx.projectA.id);
    for (const s of fx.metricsA.sections.filter((x) => x.kind === "human_analysis")) {
      await updateReportSection(edu, { sectionId: s.id, title: s.title, body: "Texto del editor" });
    }
    await markAiSectionReviewed(edu, { sectionId: fx.aiA.aiSection.id });
    await expect(approveReport(edu, { reportId: fx.metricsA.report.id })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      updateReportSection(rev, { sectionId: fx.metricsA.sections[0].id, title: "x", body: "x" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await approveReport(rev, { reportId: fx.metricsA.report.id });
  });
});

describe("cierre del ciclo", () => {
  it("con el informe aprobado se cierra; cerrado no admite métricas ni cambios en el informe; se puede reabrir", async () => {
    await fillAnalysisAndApprove();
    const edu = await requireProjectAccess(fx.actors.edu, fx.projectA.id);
    await expect(closeCycle(edu, { cycleId: cycleA(), learnings: "Aprendizajes del mes" })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(closeCycle(ctx, { cycleId: cycleA(), learnings: "corto" })).rejects.toBeInstanceOf(ValidationError);
    await closeCycle(ctx, { cycleId: cycleA(), learnings: "Los reels funcionan mejor que los carruseles" });

    await expect(
      recordMetricValue(ctx, { cycleId: cycleA(), channelId: channelA(), metricKey: "social.reach", value: "1" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(applyMetricImport(ctx, {
      importId: fx.metricsA.csvImport.id,
      numberFormat: "es",
      mappings: [{ metricKey: "social.reach", column: 1, aggregation: "sum" }],
    })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(reopenReport(ctx, { reportId: fx.metricsA.report.id, reason: "x x x" })).rejects.toBeInstanceOf(
      ForbiddenError,
    );

    await reopenCycle(ctx, { cycleId: cycleA(), reason: "Faltaba el email" });
    await expect(
      recordMetricValue(ctx, { cycleId: cycleA(), channelId: channelA(), metricKey: "social.reach", value: "1" }),
    ).resolves.toBeTruthy();
  });
});

describe("catálogo de métricas", () => {
  it("el administrador crea y desactiva métricas; desactivada no se ofrece ni se registra, pero conserva datos", async () => {
    const key = `social.saves_${crypto.randomUUID().slice(0, 8)}`;
    const fields = { label: "Guardados", description: "Veces que se guardó el contenido", defaultAggregation: "sum" as const };
    await expect(adminCreateMetricDefinition(fx.actors.admin, { key: "Mala clave", unit: "count", ...fields })).rejects.toBeInstanceOf(
      ValidationError,
    );
    await adminCreateMetricDefinition(fx.actors.admin, { key, unit: "count", ...fields });
    expect((await listMetricCatalog(ctx)).map((d) => d.key)).toContain(key);
    await recordMetricValue(ctx, { cycleId: cycleA(), channelId: channelA(), metricKey: key, value: "7" });

    await adminUpdateMetricDefinition(fx.actors.admin, { key, isActive: false, ...fields });
    expect((await findDefinition(key))!.isActive).toBe(false);
    expect((await listMetricCatalog(ctx)).map((d) => d.key)).not.toContain(key);
    await expect(
      recordMetricValue(ctx, { cycleId: cycleA(), channelId: channelA(), metricKey: key, value: "8", note: "x" }),
    ).rejects.toBeInstanceOf(ValidationError);
    const [summary] = await getMetricSummary(ctx, { cycleId: cycleA(), channelId: channelA() });
    expect(summary.rows.find((r) => r.definition.key === key)?.value).toBe(7);
  });
});
