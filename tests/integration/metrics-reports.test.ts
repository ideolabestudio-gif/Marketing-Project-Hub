import { eq } from "drizzle-orm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import { ReportBody } from "@/components/report-body";
import { getDb } from "@/lib/db/client";
import { formatMetric } from "@/lib/format";
import { metricImports, metricValues, reportHighlights, reportSections } from "@/lib/db/schema";
import { ForbiddenError, ValidationError } from "@/lib/errors";
import { requireProjectAccess, type ProjectContext } from "@/modules/access/context";
import { createItem } from "@/modules/content/service";
import { closeCycle, openCycle, reopenCycle } from "@/modules/cycles/service";
import { createChannel } from "@/modules/projects/service";
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
  addReportHighlight,
  addReportSection,
  approveReport,
  createReport,
  getReport,
  getReportView,
  removeReportHighlight,
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
    expect(preview.looksLikeKind).toBeNull();

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

  it("tienda online: el informe de Ingresos de WooCommerce se reconoce y se suma por días", async () => {
    const shop = await createChannel(ctx, { platform: "woocommerce", displayName: "Tienda" });
    expect(shop.kind).toBe("shop");
    // Mismas cabeceras que la descarga de WooCommerce (Analíticas › Ingresos), cifras inventadas para la prueba.
    const text = [
      '"Fecha","Número de artículos vendidos","Cantidad de pedidos.","Importe neto promedio de ventas ","Importe del cupón","Cantidad de envíos","Cantidad de ventas bruto","Cantidad de ventas netas","Cantidad reembolsada"',
      '"2026-10-1","7","2","17.53","0.00","0.00","150.00","123.96","0.00"',
      '"2026-10-2","0","0","0","0.00","0.00","0.00","0.00","0.00"',
      '"2026-10-3","2","1","0","4.59","0.00","0.00","-10.41","0.00"',
    ].join("\n");
    const imp = await uploadMetricCsv(ctx, { cycleId: cycleA(), channelId: shop.id, filename: "report.csv", text });
    const preview = await getMetricImport(ctx, imp.id);
    expect(preview.suggestedFormat).toBe("en");
    const suggested = Object.fromEntries(preview.suggestions.map((s) => [s.definition.key, s.column]));
    expect(suggested).toEqual({
      "shop.orders": 2,
      "shop.items_sold": 1,
      "shop.gross_sales": 6,
      "shop.net_sales": 7,
      "shop.coupons": 4,
      "shop.refunds": 8,
      "shop.shipping": 5,
    });
    // Solo métricas de tienda: el promedio diario no tiene métrica (no se calcula ni se suma).
    expect(preview.suggestions.every((s) => s.definition.kind === "shop")).toBe(true);
    expect(preview.looksLikeKind).toBeNull();

    // El mismo archivo subido por error al canal de Instagram: se avisa de que parece de la tienda.
    const wrong = await uploadMetricCsv(ctx, { cycleId: cycleA(), channelId: channelA(), filename: "report.csv", text });
    const wrongPreview = await getMetricImport(ctx, wrong.id);
    expect(wrongPreview.suggestions.every((s) => s.column === null)).toBe(true);
    expect(wrongPreview.looksLikeKind).toBe("shop");

    await applyMetricImport(ctx, {
      importId: imp.id,
      numberFormat: "en",
      mappings: preview.suggestions.map((s) => ({ metricKey: s.definition.key, column: s.column!, aggregation: "sum" as const })),
    });
    const [summary] = await getMetricSummary(ctx, { cycleId: cycleA(), channelId: shop.id });
    const value = (key: string) => summary.rows.find((r) => r.definition.key === key)!.value;
    expect(value("shop.orders")).toBe(3);
    expect(value("shop.items_sold")).toBe(9);
    expect(value("shop.net_sales")).toBe(113.55);
    expect(value("shop.coupons")).toBe(4.59);

    // La tienda no tiene piezas en el calendario.
    await expect(
      createItem(ctx, { cycleId: cycleA(), channelId: shop.id, format: "post", title: "No" }),
    ).rejects.toBeInstanceOf(ValidationError);
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
    // Por defecto las métricas sin valor no ocupan filas, pero se nombran: nada se esconde.
    expect(html).toContain("Sin dato este mes: ");
    expect(html).toContain("alcance");
    expect(html).not.toMatch(/<td[^>]*>sin dato</);
    expect(html).toContain(`>${formatMetric(1250, "count")}<`);
    expect(html).toContain("Resumen ALFA-SECRET");
    expect(html).toContain("BORRADOR");
    expect(html).not.toContain(MARKER_B);

    const data = fx.metricsA.sections.find((s) => s.kind === "data")!;
    await updateReportSection(ctx, { sectionId: data.id, title: data.title, channelId: channelA(), showEmptyMetrics: true });
    const all = renderToStaticMarkup(createElement(ReportBody, { view: await getReportView(ctx, cycleA()) }));
    expect(all).toMatch(/<td[^>]*>sin dato</);
    expect(all).not.toContain("Sin dato este mes: ");
  });

  it("dice qué falta antes de aprobar: lo obligatorio coincide con lo que exige approveReport", async () => {
    const { checks } = await getReportView(ctx, cycleA());
    const required = checks.filter((c) => c.level === "required");
    expect(required.map((c) => c.message).join(" ")).toMatch(/Conclusiones/);
    expect(required.some((c) => c.sectionId === fx.aiA.aiSection.id)).toBe(true);
    for (const s of fx.metricsA.sections.filter((x) => x.kind === "human_analysis")) {
      await updateReportSection(ctx, { sectionId: s.id, title: s.title, body: "Análisis del equipo" });
    }
    await markAiSectionReviewed(ctx, { sectionId: fx.aiA.aiSection.id });
    const after = (await getReportView(ctx, cycleA())).checks;
    expect(after.filter((c) => c.level === "required")).toEqual([]);
    expect(JSON.stringify(after)).not.toContain(MARKER_B);
    await approveReport(ctx, { reportId: fx.metricsA.report.id });
  });

  it("avisa de los canales sin ninguna métrica este mes, sin bloquear", async () => {
    const empty = await openCycle(ctx, { period: "2026-12" });
    await createReport(ctx, { cycleId: empty.id });
    const { checks } = await getReportView(ctx, empty.id);
    expect(checks).toContainEqual(expect.objectContaining({ level: "warning", fix: "metrics" }));
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

  it("cifras destacadas: se proponen al crear, muestran valor y evolución, y valen solo métricas del canal", async () => {
    const sept = await openCycle(ctx, { period: "2026-09" });
    await recordMetricValue(ctx, { cycleId: sept.id, channelId: channelA(), metricKey: "social.followers", value: "1000" });
    const view = await getReportView(ctx, cycleA());
    expect(view.highlights.map((h) => h.row.definition.key)).toEqual(["social.followers", "social.reach"]);
    const followers = view.highlights[0].row;
    expect(followers).toMatchObject({ value: 1250, previous: 1000, change: 25 });
    expect(followers.history).toEqual([null, null, null, null, 1000, 1250]);
    expect(view.highlights[0].periods.at(-1)).toBe("2026-10");

    const html = renderToStaticMarkup(createElement(ReportBody, { view }));
    expect(html).toContain("Cifras destacadas");
    expect(html).toContain("vs. septiembre<");
    expect(html).toContain("Últimos 6 meses");
    expect(html).toContain("Septiembre de 2026: 1000");

    await expect(
      addReportHighlight(ctx, { reportId: fx.metricsA.report.id, channelId: channelA(), metricKey: "email.open_rate" }),
    ).rejects.toBeInstanceOf(ValidationError);
    await addReportHighlight(ctx, { reportId: fx.metricsA.report.id, channelId: channelA(), metricKey: "social.posts" });
    await addReportHighlight(ctx, { reportId: fx.metricsA.report.id, channelId: channelA(), metricKey: "social.interactions" });
    await expect(
      addReportHighlight(ctx, { reportId: fx.metricsA.report.id, channelId: channelA(), metricKey: "social.impressions" }),
    ).rejects.toThrow(/Como mucho/);
    await removeReportHighlight(ctx, { highlightId: fx.metricsA.highlights[1].id });
    expect((await getReportView(ctx, cycleA())).highlights).toHaveLength(3);
  });

  it("con el informe aprobado, las cifras destacadas quedan bloqueadas (también en BD)", async () => {
    await fillAnalysisAndApprove();
    await expect(removeReportHighlight(ctx, { highlightId: fx.metricsA.highlights[0].id })).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(
      await pgCode(getDb().delete(reportHighlights).where(eq(reportHighlights.id, fx.metricsA.highlights[0].id))),
    ).toBe("42501");
  });

  it("copia la estructura y las cifras del mes anterior, sin textos ni secciones de IA", async () => {
    const nov = await openCycle(ctx, { period: "2026-11" });
    await createReport(ctx, { cycleId: nov.id, fromPrevious: true });
    const copy = (await getReport(ctx, nov.id))!;
    const original = fx.metricsA.sections.filter((s) => s.kind !== "ai_interpretation");
    expect(copy.sections.map((s) => [s.kind, s.title, s.channelId])).toEqual(
      original.map((s) => [s.kind, s.title, s.channelId]),
    );
    expect(copy.sections.filter((s) => s.kind === "human_analysis").every((s) => s.body === "")).toBe(true);
    expect(copy.highlights.map((h) => h.metricKey)).toEqual(fx.metricsA.highlights.map((h) => h.metricKey));

    const dec = await openCycle(ctx, { period: "2026-12" });
    await expect(createReport(ctx, { cycleId: dec.id, fromPrevious: true })).resolves.toBeDefined();
    const jan = await openCycle(ctx, { period: "2027-02" });
    await expect(createReport(ctx, { cycleId: jan.id, fromPrevious: true })).rejects.toBeInstanceOf(ValidationError);
  });

  it("el contenido publicado lleva un resumen frente a lo previsto en el calendario", async () => {
    const html = renderToStaticMarkup(createElement(ReportBody, { view: await getReportView(ctx, cycleA()) }));
    expect(html).toMatch(/0 publicadas<!-- --> y 1 programada|0 publicadas y 1 programada/);
    expect(html).toMatch(/piezas<!-- --> del calendario del mes|piezas del calendario del mes/);
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
