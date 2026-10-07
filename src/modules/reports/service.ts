import { z } from "zod";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { isUniqueViolation, isUuid, parseInput } from "@/lib/validation";
import { authorize, type ProjectContext } from "@/modules/access/context";
import { recordAudit } from "@/modules/audit/service";
import { assertCycleWritable, getCycle } from "@/modules/cycles/service";
import { getMetricSummary } from "@/modules/metrics/service";
import { getProject, listChannels } from "@/modules/projects/service";
import { listCyclePublications } from "@/modules/review/service";
import * as repo from "./repo";

// Un informe mezcla DATOS (métricas registradas y publicaciones del Hub, nunca
// estimados) y ANÁLISIS escrito por personas. Cada sección declara qué es.

export const SECTION_KIND_LABELS = {
  data: "Datos (métricas registradas)",
  publications: "Contenido publicado",
  human_analysis: "Análisis del equipo",
} as const;

export type ReportSection = repo.SectionRow;

export async function getReport(ctx: ProjectContext, cycleId: string) {
  await authorize(ctx, "project.read");
  const cycle = await getCycle(ctx, cycleId);
  const report = await repo.findReportByCycle(ctx, cycle.id);
  return report ? { report, sections: await repo.listSections(ctx, report.id) } : null;
}

/** Crea el informe del ciclo con una estructura propuesta, editable después. */
export async function createReport(ctx: ProjectContext, input: { cycleId: string }) {
  await authorize(ctx, "report.write");
  const cycle = await getCycle(ctx, input.cycleId);
  assertCycleWritable(cycle);
  const channels = (await listChannels(ctx)).filter((c) => c.isActive);
  try {
    const report = await repo.createReportWithSections(ctx, cycle.id, [
      { kind: "human_analysis", title: "Resumen del mes", body: "", channelId: null, comparePrevious: true },
      ...channels.map((c) => ({
        kind: "data" as const,
        title: c.displayName,
        body: null,
        channelId: c.id,
        comparePrevious: true,
      })),
      { kind: "publications", title: "Contenido publicado", body: null, channelId: null, comparePrevious: true },
      { kind: "human_analysis", title: "Conclusiones y próximos pasos", body: "", channelId: null, comparePrevious: true },
    ]);
    await audit(ctx, "report.created", report.id);
    return report;
  } catch (err) {
    if (isUniqueViolation(err)) throw new ConflictError("Este ciclo ya tiene informe");
    throw err;
  }
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
  });
  await audit(ctx, "report.section_added", report.id, { sectionId: section.id });
  return section;
}

const updateSectionSchema = sectionSchema.extend({ sectionId: z.string() });

export async function updateReportSection(ctx: ProjectContext, input: z.input<typeof updateSectionSchema>) {
  const data = parseInput(updateSectionSchema, input);
  const { section, report } = await loadEditableSection(ctx, data.sectionId);
  await repo.updateSection(ctx, section.id, {
    title: data.title,
    body: section.kind === "human_analysis" ? (data.body ?? "") : null,
    channelId: section.kind === "data" ? await resolveChannelId(ctx, data.channelId) : null,
    comparePrevious: data.comparePrevious,
  });
  await audit(ctx, "report.section_updated", report.id, { sectionId: section.id });
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
  const empty = sections.filter((s) => s.kind === "human_analysis" && !s.body?.trim());
  if (empty.length > 0) {
    throw new ValidationError(`Completa o elimina las secciones de análisis vacías: ${empty.map((s) => s.title).join(", ")}`);
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
  const [project, sections, publications] = await Promise.all([
    getProject(ctx),
    repo.listSections(ctx, report.id),
    listCyclePublications(ctx, cycle.id),
  ]);
  const resolved = [];
  for (const section of sections) {
    if (section.kind === "data") {
      resolved.push({ section, metrics: await getMetricSummary(ctx, { cycleId: cycle.id, channelId: section.channelId }) });
    } else if (section.kind === "publications") {
      resolved.push({ section, publications });
    } else {
      resolved.push({ section });
    }
  }
  return { project, cycle, report, sections: resolved };
}

async function audit(ctx: ProjectContext, action: string, reportId: string, data?: Record<string, unknown>) {
  await recordAudit({ action, actorId: ctx.actor.userId, projectId: ctx.projectId, entityType: "report", entityId: reportId, data });
}
