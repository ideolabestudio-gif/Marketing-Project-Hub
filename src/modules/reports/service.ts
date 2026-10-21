import { z } from "zod";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { isForeignKeyViolation, isUniqueViolation, isUuid, parseInput } from "@/lib/validation";
import { authorize, type ProjectContext } from "@/modules/access/context";
import { recordAudit } from "@/modules/audit/service";
import { previousPeriod } from "@/lib/time";
import { assertCycleWritable, getCycle, getCycleByPeriod } from "@/modules/cycles/service";
import { getMetricSummary, listMetricCatalog } from "@/modules/metrics/service";
import { getProject, listChannels } from "@/modules/projects/service";
import { listCyclePublications, listCycleStatuses } from "@/modules/review/service";
import * as repo from "./repo";

// Un informe mezcla DATOS (métricas registradas y publicaciones del Hub, nunca
// estimados) y ANÁLISIS escrito por personas. Cada sección declara qué es.

export const SECTION_KIND_LABELS = {
  data: "Datos (métricas registradas)",
  publications: "Contenido publicado",
  human_analysis: "Análisis del equipo",
  ai_interpretation: "Interpretación asistida por IA",
} as const;

export type ReportSection = repo.SectionRow;

export async function getReport(ctx: ProjectContext, cycleId: string) {
  await authorize(ctx, "project.read");
  const cycle = await getCycle(ctx, cycleId);
  const report = await repo.findReportByCycle(ctx, cycle.id);
  if (!report) return null;
  const [sections, highlights] = await Promise.all([repo.listSections(ctx, report.id), repo.listHighlights(ctx, report.id)]);
  return { report, sections, highlights };
}

/** Como mucho, cifras destacadas por informe. */
export const MAX_HIGHLIGHTS = 4;

/** Cifras destacadas que se proponen la primera vez, por tipo de canal. */
const DEFAULT_HIGHLIGHTS: Record<string, string[]> = {
  social: ["social.followers", "social.reach"],
  email: ["email.subscribers", "email.open_rate"],
  shop: ["shop.net_sales", "shop.orders"],
};

/** Informe del mes anterior del proyecto, si existe. */
async function findPreviousReport(ctx: ProjectContext, period: string) {
  const previous = await getCycleByPeriod(ctx, previousPeriod(period)).catch((err) => {
    if (err instanceof NotFoundError) return null;
    throw err;
  });
  return previous ? repo.findReportByCycle(ctx, previous.id) : undefined;
}

/** ¿Hay informe del mes anterior para copiar su estructura? */
export async function hasPreviousReport(ctx: ProjectContext, cycleId: string): Promise<boolean> {
  await authorize(ctx, "project.read");
  const cycle = await getCycle(ctx, cycleId);
  return Boolean(await findPreviousReport(ctx, cycle.period));
}

/**
 * Crea el informe del ciclo con una estructura propuesta, editable después. Con
 * `fromPrevious`, copia títulos, orden y canales del informe del mes anterior (los textos
 * vacíos; nunca las secciones de IA). Las cifras destacadas se heredan del mes anterior.
 */
export async function createReport(ctx: ProjectContext, input: { cycleId: string; fromPrevious?: boolean }) {
  await authorize(ctx, "report.write");
  const cycle = await getCycle(ctx, input.cycleId);
  assertCycleWritable(cycle);
  const channels = (await listChannels(ctx)).filter((c) => c.isActive);
  const active = new Set(channels.map((c) => c.id));
  const previous = await findPreviousReport(ctx, cycle.period);
  if (input.fromPrevious && !previous) throw new ValidationError("El mes anterior no tiene informe");

  const sections =
    input.fromPrevious && previous
      ? (await repo.listSections(ctx, previous.id))
          .filter((s) => s.kind !== "ai_interpretation" && (s.channelId === null || active.has(s.channelId)))
          .map((s) => ({
            kind: s.kind,
            title: s.title,
            body: s.kind === "human_analysis" ? "" : null,
            channelId: s.channelId,
            comparePrevious: s.comparePrevious,
            showEmptyMetrics: s.showEmptyMetrics,
          }))
      : [
          { kind: "human_analysis" as const, title: "Resumen del mes", body: "", channelId: null, comparePrevious: true },
          ...channels.map((c) => ({
            kind: "data" as const,
            title: c.displayName,
            body: null,
            channelId: c.id,
            comparePrevious: true,
          })),
          { kind: "publications" as const, title: "Contenido publicado", body: null, channelId: null, comparePrevious: true },
          {
            kind: "human_analysis" as const,
            title: "Conclusiones y próximos pasos",
            body: "",
            channelId: null,
            comparePrevious: true,
          },
        ];

  let highlights: repo.NewHighlight[];
  if (previous) {
    highlights = (await repo.listHighlights(ctx, previous.id))
      .filter((h) => active.has(h.channelId))
      .map((h) => ({ channelId: h.channelId, metricKey: h.metricKey }));
  } else {
    const catalog = new Set((await listMetricCatalog(ctx)).map((d) => d.key));
    highlights = channels.flatMap((c) =>
      (DEFAULT_HIGHLIGHTS[c.kind] ?? []).filter((k) => catalog.has(k)).map((metricKey) => ({ channelId: c.id, metricKey })),
    );
  }

  try {
    const report = await repo.createReportWithSections(ctx, cycle.id, sections, highlights.slice(0, MAX_HIGHLIGHTS));
    await audit(ctx, "report.created", report.id, input.fromPrevious ? { from: previous?.id } : undefined);
    return report;
  } catch (err) {
    if (isUniqueViolation(err)) throw new ConflictError("Este ciclo ya tiene informe");
    throw err;
  }
}

const highlightSchema = z.object({ reportId: z.string(), channelId: z.string(), metricKey: z.string() });

/** Añade una cifra destacada (métrica de un canal) al principio del informe. */
export async function addReportHighlight(ctx: ProjectContext, input: z.input<typeof highlightSchema>) {
  const data = parseInput(highlightSchema, input);
  const report = await loadEditableReport(ctx, data.reportId);
  const channel = (await listChannels(ctx)).find((c) => c.id === data.channelId);
  if (!channel) throw new NotFoundError("Canal no encontrado");
  const definition = (await listMetricCatalog(ctx)).find((d) => d.key === data.metricKey);
  if (!definition || definition.kind !== channel.kind) throw new ValidationError("Esa métrica no es de este tipo de canal");
  if ((await repo.listHighlights(ctx, report.id)).length >= MAX_HIGHLIGHTS) {
    throw new ValidationError(`Como mucho ${MAX_HIGHLIGHTS} cifras destacadas: quita una antes`);
  }
  try {
    const highlight = await repo.insertHighlight(ctx, report.id, { channelId: channel.id, metricKey: definition.key });
    await audit(ctx, "report.highlight_added", report.id, { highlightId: highlight.id, metricKey: definition.key });
    return highlight;
  } catch (err) {
    if (isUniqueViolation(err)) throw new ConflictError("Esa cifra ya está destacada");
    throw err;
  }
}

export async function removeReportHighlight(ctx: ProjectContext, input: { highlightId: string }) {
  await authorize(ctx, "report.write");
  const highlight = isUuid(input.highlightId) ? await repo.findHighlight(ctx, input.highlightId) : undefined;
  if (!highlight) throw new NotFoundError();
  const report = await loadEditableReport(ctx, highlight.reportId);
  await repo.deleteHighlight(ctx, highlight.id);
  await audit(ctx, "report.highlight_removed", report.id, { highlightId: highlight.id, metricKey: highlight.metricKey });
}

async function loadEditableReport(ctx: ProjectContext, reportId: string) {
  await authorize(ctx, "report.write");
  const report = isUuid(reportId) ? await repo.findReport(ctx, reportId) : undefined;
  if (!report) throw new NotFoundError();
  assertCycleWritable(await getCycle(ctx, report.cycleId));
  if (report.status === "approved") throw new ValidationError("El informe está aprobado: reábrelo para modificarlo");
  return report;
}

async function loadEditableSection(ctx: ProjectContext, sectionId: string) {
  const section = isUuid(sectionId) ? await repo.findSection(ctx, sectionId) : undefined;
  if (!section) throw new NotFoundError();
  const report = await loadEditableReport(ctx, section.reportId);
  return { section, report };
}

async function resolveChannelId(ctx: ProjectContext, channelId: string | null | undefined) {
  if (!channelId) return null;
  const channel = (await listChannels(ctx)).find((c) => c.id === channelId);
  if (!channel) throw new NotFoundError("Canal no encontrado");
  return channel.id;
}

const sectionSchema = z.object({
  title: z.string().trim().min(1, "Indica un título").max(150),
  body: z.string().max(20000).optional(),
  channelId: z.string().optional(),
  comparePrevious: z.boolean().default(true),
  showEmptyMetrics: z.boolean().default(false),
});

const addSectionSchema = sectionSchema.extend({
  reportId: z.string(),
  kind: z.enum(["data", "publications", "human_analysis"], "Tipo de sección no válido"),
});

export async function addReportSection(ctx: ProjectContext, input: z.input<typeof addSectionSchema>) {
  const data = parseInput(addSectionSchema, input);
  const report = await loadEditableReport(ctx, data.reportId);
  const section = await repo.insertSection(ctx, report.id, {
    kind: data.kind,
    title: data.title,
    body: data.kind === "human_analysis" ? (data.body ?? "") : null,
    channelId: data.kind === "data" ? await resolveChannelId(ctx, data.channelId) : null,
    comparePrevious: data.comparePrevious,
    showEmptyMetrics: data.kind === "data" && data.showEmptyMetrics,
  });
  await audit(ctx, "report.section_added", report.id, { sectionId: section.id });
  return section;
}

const updateSectionSchema = sectionSchema.extend({ sectionId: z.string() });

export async function updateReportSection(ctx: ProjectContext, input: z.input<typeof updateSectionSchema>) {
  const data = parseInput(updateSectionSchema, input);
  const { section, report } = await loadEditableSection(ctx, data.sectionId);
  const hasBody = section.kind === "human_analysis" || section.kind === "ai_interpretation";
  const body = hasBody ? (data.body ?? "") : null;
  await repo.updateSection(ctx, section.id, {
    title: data.title,
    body,
    channelId: section.kind === "data" ? await resolveChannelId(ctx, data.channelId) : null,
    comparePrevious: data.comparePrevious,
    showEmptyMetrics: section.kind === "data" && data.showEmptyMetrics,
    // Si cambia el texto de la IA, hay que volver a revisarlo.
    ...(section.kind === "ai_interpretation" && body !== section.body ? { reviewedBy: null, reviewedAt: null } : {}),
  });
  await audit(ctx, "report.section_updated", report.id, { sectionId: section.id });
}

const aiSectionSchema = z.object({
  cycleId: z.string(),
  aiGenerationId: z.string(),
  title: z.string().trim().min(1, "Indica un título").max(150),
  body: z.string().trim().min(1, "El texto está vacío").max(20000),
});

/**
 * Añade al informe una interpretación generada por IA (la llama el módulo ai al
 * "usar" una generación). Queda marcada y sin revisar: el informe no se aprueba
 * hasta que una persona la revise.
 */
export async function addAiInterpretationSection(ctx: ProjectContext, input: z.input<typeof aiSectionSchema>) {
  const data = parseInput(aiSectionSchema, input);
  await authorize(ctx, "report.write");
  const cycle = await getCycle(ctx, data.cycleId);
  const current = await repo.findReportByCycle(ctx, cycle.id);
  if (!current) throw new ValidationError("Crea primero el informe del mes");
  const report = await loadEditableReport(ctx, current.id);
  if (!isUuid(data.aiGenerationId)) throw new NotFoundError();
  try {
    const section = await repo.insertSection(ctx, report.id, {
      kind: "ai_interpretation",
      title: data.title,
      body: data.body,
      channelId: null,
      comparePrevious: false,
      aiGenerationId: data.aiGenerationId,
    });
    await audit(ctx, "report.ai_section_added", report.id, { sectionId: section.id, aiGenerationId: data.aiGenerationId });
    return section;
  } catch (err) {
    if (isForeignKeyViolation(err)) throw new NotFoundError("Generación no encontrada");
    throw err;
  }
}

/** Una persona confirma que ha leído y comprobado la interpretación de la IA. */
export async function markAiSectionReviewed(ctx: ProjectContext, input: { sectionId: string }) {
  const { section, report } = await loadEditableSection(ctx, input.sectionId);
  if (section.kind !== "ai_interpretation") throw new ValidationError("Solo se revisan las secciones de IA");
  if (!section.body?.trim()) throw new ValidationError("La sección está vacía");
  await repo.updateSection(ctx, section.id, { reviewedBy: ctx.actor.userId, reviewedAt: new Date() });
  await audit(ctx, "report.ai_section_reviewed", report.id, { sectionId: section.id });
}

export async function deleteReportSection(ctx: ProjectContext, input: { sectionId: string }) {
  const { section, report } = await loadEditableSection(ctx, input.sectionId);
  await repo.deleteSection(ctx, section.id);
  await audit(ctx, "report.section_deleted", report.id, { sectionId: section.id, title: section.title });
}

export async function moveReportSection(ctx: ProjectContext, input: { sectionId: string; direction: "up" | "down" }) {
  const { section, report } = await loadEditableSection(ctx, input.sectionId);
  const sections = await repo.listSections(ctx, report.id);
  const i = sections.findIndex((s) => s.id === section.id);
  const j = input.direction === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= sections.length) return;
  await repo.swapPositions(ctx, sections[i], sections[j]);
}

/** Aprobar bloquea el informe (también en BD). Exige que el análisis no esté vacío. */
export async function approveReport(ctx: ProjectContext, input: { reportId: string }) {
  await authorize(ctx, "report.approve");
  const report = isUuid(input.reportId) ? await repo.findReport(ctx, input.reportId) : undefined;
  if (!report) throw new NotFoundError();
  assertCycleWritable(await getCycle(ctx, report.cycleId));
  if (report.status === "approved") throw new ValidationError("El informe ya está aprobado");
  const sections = await repo.listSections(ctx, report.id);
  if (sections.length === 0) throw new ValidationError("El informe no tiene secciones");
  const empty = sections.filter((s) => (s.kind === "human_analysis" || s.kind === "ai_interpretation") && !s.body?.trim());
  if (empty.length > 0) {
    throw new ValidationError(`Completa o elimina las secciones de análisis vacías: ${empty.map((s) => s.title).join(", ")}`);
  }
  // WF-06: lo generado por IA no sale sin que una persona lo haya revisado.
  const unreviewed = sections.filter((s) => s.kind === "ai_interpretation" && !s.reviewedBy);
  if (unreviewed.length > 0) {
    throw new ValidationError(`Revisa antes las secciones generadas con IA: ${unreviewed.map((s) => s.title).join(", ")}`);
  }
  await repo.updateReport(ctx, report.id, { status: "approved", approvedBy: ctx.actor.userId, approvedAt: new Date() });
  await audit(ctx, "report.approved", report.id);
}

export async function reopenReport(ctx: ProjectContext, input: { reportId: string; reason: string }) {
  await authorize(ctx, "report.approve");
  const reason = parseInput(z.string().trim().min(3, "Indica el motivo").max(500), input.reason);
  const report = isUuid(input.reportId) ? await repo.findReport(ctx, input.reportId) : undefined;
  if (!report) throw new NotFoundError();
  const cycle = await getCycle(ctx, report.cycleId);
  if (cycle.status === "closed") throw new ForbiddenError("El ciclo está cerrado: reábrelo primero");
  if (report.status !== "approved") throw new ValidationError("El informe no está aprobado");
  await repo.updateReport(ctx, report.id, { status: "draft", approvedBy: null, approvedAt: null });
  await audit(ctx, "report.reopened", report.id, { reason });
}

/**
 * Informe listo para pintar (pantalla e impresión a PDF): cada sección de datos trae sus
 * métricas registradas (o "sin dato") y la de contenido, lo publicado según el Hub.
 */
export async function getReportView(ctx: ProjectContext, cycleId: string) {
  await authorize(ctx, "project.read");
  const cycle = await getCycle(ctx, cycleId);
  const report = await repo.findReportByCycle(ctx, cycle.id);
  if (!report) throw new NotFoundError("Este ciclo todavía no tiene informe");
  const [project, sections, publications, highlightRows, allMetrics, statuses] = await Promise.all([
    getProject(ctx),
    repo.listSections(ctx, report.id),
    listCyclePublications(ctx, cycle.id),
    repo.listHighlights(ctx, report.id),
    getMetricSummary(ctx, { cycleId: cycle.id }),
    listCycleStatuses(ctx, cycle.id),
  ]);
  // Cada cifra destacada lleva su fila del resumen (valor, mes anterior, evolución).
  const highlights = highlightRows.flatMap((h) => {
    const summary = allMetrics.find((m) => m.channel.id === h.channelId);
    const row = summary?.rows.find((r) => r.definition.key === h.metricKey);
    return summary && row ? [{ id: h.id, channel: summary.channel, periods: summary.periods, row }] : [];
  });
  /** Piezas del calendario del mes (sin las canceladas): lo previsto frente a lo publicado. */
  const plannedCount = Object.values(statuses).filter((st) => st !== "cancelled").length;
  const resolved = [];
  for (const section of sections) {
    if (section.kind === "data") {
      resolved.push({ section, metrics: await getMetricSummary(ctx, { cycleId: cycle.id, channelId: section.channelId }) });
    } else if (section.kind === "publications") {
      // Primero lo publicado; después lo que sigue programado.
      resolved.push({
        section,
        publications: [...publications].sort((a, b) => Number(a.status !== "published") - Number(b.status !== "published")),
      });
    } else {
      resolved.push({ section });
    }
  }
  return {
    project,
    cycle,
    report,
    highlights,
    plannedCount,
    sections: resolved,
    checks: reportChecks(resolved, publications),
  };
}

/**
 * Lo que falta antes de aprobar. Lo "required" lo exige también approveReport; los avisos
 * ("warning") no bloquean: señalan datos que quizá falten por registrar.
 */
export type ReportCheck = {
  level: "required" | "warning";
  message: string;
  /** Sección a la que lleva el aviso. */
  sectionId?: string;
  /** Página del ciclo donde se arregla. */
  fix?: "metrics" | "cycle";
};

type ResolvedSection = {
  section: ReportSection;
  metrics?: Awaited<ReturnType<typeof getMetricSummary>>;
};

function reportChecks(
  sections: ResolvedSection[],
  publications: Awaited<ReturnType<typeof listCyclePublications>>,
): ReportCheck[] {
  const checks: ReportCheck[] = [];
  if (sections.length === 0) checks.push({ level: "required", message: "El informe no tiene secciones." });
  for (const { section } of sections) {
    if ((section.kind === "human_analysis" || section.kind === "ai_interpretation") && !section.body?.trim()) {
      checks.push({ level: "required", message: `«${section.title}» está vacía: escribe el texto o elimínala.`, sectionId: section.id });
    } else if (section.kind === "ai_interpretation" && !section.reviewedBy) {
      checks.push({ level: "required", message: `«${section.title}» (IA) está sin revisar.`, sectionId: section.id });
    }
  }
  const seen = new Set<string>();
  for (const { section, metrics } of sections) {
    for (const { channel, rows } of metrics ?? []) {
      if (seen.has(channel.id)) continue;
      seen.add(channel.id);
      if (rows.every((r) => r.value === null)) {
        checks.push({
          level: "warning",
          message: `No hay métricas de ${channel.displayName} registradas este mes.`,
          sectionId: section.id,
          fix: "metrics",
        });
      }
    }
  }
  const scheduled = publications.filter((p) => p.status !== "published").length;
  if (scheduled > 0) {
    checks.push({
      level: "warning",
      message:
        scheduled === 1
          ? "1 pieza sigue como programada: si ya salió, registra su publicación."
          : `${scheduled} piezas siguen como programadas: si ya salieron, registra su publicación.`,
      fix: "cycle",
    });
  }
  return checks;
}

async function audit(ctx: ProjectContext, action: string, reportId: string, data?: Record<string, unknown>) {
  await recordAudit({ action, actorId: ctx.actor.userId, projectId: ctx.projectId, entityType: "report", entityId: reportId, data });
}
