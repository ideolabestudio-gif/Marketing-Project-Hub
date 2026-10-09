import { formatChange, formatMetric } from "@/lib/format";
import { NotFoundError } from "@/lib/errors";
import { formatInZone, formatPeriod, previousPeriod, utcToWallTime } from "@/lib/time";
import type { ProjectContext } from "@/modules/access/context";
import { BRAND_FIELDS, getBrandProfile } from "@/modules/brand/service";
import { getItemDetail, LIBRARY_CATEGORIES, listItems, listLibrary } from "@/modules/content/service";
import { FORMATS, formatLabel } from "@/modules/content/formats";
import { getCycle, getCycleByPeriod } from "@/modules/cycles/service";
import { getProject, listChannels } from "@/modules/projects/service";
import { getMetricSummary } from "@/modules/metrics/service";
import { listCyclePublications } from "@/modules/review/service";
import { channelRef } from "./calendar-plan";

/**
 * Construcción del contexto que recibe la IA. Todo se lee a través de los servicios
 * con el ProjectContext, así que solo puede contener datos del proyecto del contexto
 * (un ID de otro proyecto falla con NotFoundError antes de llamar al proveedor).
 * `inputRefs` deja constancia de qué filas se usaron.
 */
export type BuiltContext = { cycleId: string; data: string; inputRefs: Record<string, string[]> };

function block(lines: (string | null | undefined | false)[]): string {
  return lines.filter((l): l is string => typeof l === "string" && l.trim() !== "").join("\n");
}

function brief(cycle: { objectives: string | null; keyDates: string | null; notes: string | null }) {
  return block([
    cycle.objectives && `Objetivos del mes: ${cycle.objectives}`,
    cycle.keyDates && `Fechas clave: ${cycle.keyDates}`,
    cycle.notes && `Notas: ${cycle.notes}`,
  ]) || "Brief del mes: (vacío)";
}

/**
 * Ficha del cliente (versión vigente) y lista de materiales de la biblioteca (solo
 * títulos y descripciones: la IA no ve los archivos). Va antes del brief del mes.
 */
async function brandContext(ctx: ProjectContext): Promise<{ lines: string[]; refs: Record<string, string[]> }> {
  const [{ current }, library] = await Promise.all([getBrandProfile(ctx), listLibrary(ctx)]);
  const lines: string[] = [];
  if (current) {
    lines.push("Ficha del cliente:");
    for (const f of BRAND_FIELDS) if (current[f.key]) lines.push(`${f.label}: ${current[f.key]}`);
  } else {
    lines.push("Ficha del cliente: (vacía)");
  }
  if (library.length) {
    lines.push("Materiales disponibles en la biblioteca:");
    for (const m of library) {
      lines.push(`- ${m.title} (${LIBRARY_CATEGORIES[m.category]})${m.description ? `: ${m.description}` : ""}`);
    }
  }
  lines.push("");
  return {
    lines,
    refs: {
      ...(current ? { brandProfile: [current.id] } : {}),
      ...(library.length ? { libraryItem: library.map((m) => m.id) } : {}),
    },
  };
}

export async function copyDraftContext(ctx: ProjectContext, itemId: string): Promise<BuiltContext> {
  const detail = await getItemDetail(ctx, itemId);
  const { item, current } = detail;
  const [project, cycle, brand] = await Promise.all([getProject(ctx), getCycle(ctx, item.cycleId), brandContext(ctx)]);
  const data = block([
    `Cliente: ${project.clientName}`,
    `Proyecto: ${project.name}`,
    `Idioma: ${project.locale}`,
    "",
    ...brand.lines,
    `Mes: ${formatPeriod(cycle.period, project.locale)}`,
    brief(cycle),
    "",
    `Pieza: ${item.title}`,
    `Canal: ${item.channelName} (${item.channelKind === "email" ? "email" : "red social"}, ${item.channelPlatform})`,
    `Formato: ${formatLabel(item.format)}`,
    item.plannedAt && `Fecha prevista: ${formatInZone(item.plannedAt, project.timezone, project.locale)}`,
    current && `Versión actual (v${current.versionNo}):`,
    current?.emailSubject && `Asunto: ${current.emailSubject}`,
    current?.emailPreheader && `Preencabezado: ${current.emailPreheader}`,
    current?.body,
  ]);
  return {
    cycleId: cycle.id,
    data,
    inputRefs: {
      project: [ctx.projectId],
      ...brand.refs,
      cycle: [cycle.id],
      contentItem: [item.id],
      ...(current ? { contentVersion: [current.id] } : {}),
    },
  };
}

export async function ideasContext(ctx: ProjectContext, cycleId: string): Promise<BuiltContext> {
  const [project, cycle, channels] = await Promise.all([getProject(ctx), getCycle(ctx, cycleId), listChannels(ctx)]);
  const [items, brand] = await Promise.all([listItems(ctx, cycle.id), brandContext(ctx)]);
  const active = channels.filter((c) => c.isActive);
  const data = block([
    `Cliente: ${project.clientName}`,
    `Proyecto: ${project.name}`,
    `Idioma: ${project.locale}`,
    "",
    ...brand.lines,
    `Mes: ${formatPeriod(cycle.period, project.locale)}`,
    brief(cycle),
    "",
    "Canales:",
    ...active.map((c) => `- ${c.displayName} (${c.kind === "email" ? "email" : "red social"}, ${c.platform})`),
    "",
    items.length ? "Piezas ya planificadas:" : "Todavía no hay piezas planificadas.",
    ...items.map((i) => `- ${i.title} · ${i.channelName} · ${formatLabel(i.format)}`),
  ]);
  return {
    cycleId: cycle.id,
    data,
    inputRefs: {
      project: [ctx.projectId],
      ...brand.refs,
      cycle: [cycle.id],
      channel: active.map((c) => c.id),
      contentItem: items.map((i) => i.id),
    },
  };
}

/**
 * Para proponer el calendario del mes: ficha del cliente, brief, canales activos con su referencia (C1…)
 * y formatos, lo ya planificado y, si existe, el mes anterior (piezas, aprendizajes y
 * métricas registradas; las que no tienen dato no se envían).
 */
export async function calendarPlanContext(ctx: ProjectContext, cycleId: string): Promise<BuiltContext> {
  const [project, cycle, channels] = await Promise.all([getProject(ctx), getCycle(ctx, cycleId), listChannels(ctx)]);
  const [items, brand] = await Promise.all([listItems(ctx, cycle.id), brandContext(ctx)]);
  const active = channels.filter((c) => c.isActive);
  const tz = project.timezone;
  const when = (d: Date | null) => (d ? utcToWallTime(d, tz) : "sin fecha");

  let previous: Awaited<ReturnType<typeof getCycle>> | null = null;
  try {
    previous = await getCycleByPeriod(ctx, previousPeriod(cycle.period));
  } catch (err) {
    if (!(err instanceof NotFoundError)) throw err;
  }
  const [prevItems, prevSummary] = previous
    ? await Promise.all([listItems(ctx, previous.id), getMetricSummary(ctx, { cycleId: previous.id })])
    : [[], []];
  const prevMetrics = prevSummary.flatMap(({ channel, rows }) =>
    rows.filter((r) => r.value !== null).map((r) => `- ${channel.displayName} · ${r.definition.label}: ${formatMetric(r.value, r.definition.unit)}`),
  );

  const lines: (string | null | false)[] = [
    `Cliente: ${project.clientName}`,
    `Proyecto: ${project.name}`,
    `Idioma: ${project.locale}`,
    `Zona horaria: ${tz}`,
    "",
    ...brand.lines,
    `Mes que hay que planificar: ${formatPeriod(cycle.period, project.locale)} (${cycle.period})`,
    brief(cycle),
    "",
    "Canales (referencia · nombre · tipo · formatos admitidos):",
    ...active.map(
      (c, i) =>
        `- ${channelRef(i)} · ${c.displayName} · ${c.kind === "email" ? "email" : "red social"} (${c.platform}) · ` +
        Object.keys(FORMATS[c.kind]).join(", "),
    ),
    "",
    items.length ? "Piezas ya planificadas este mes (no las repitas):" : "Todavía no hay piezas planificadas este mes.",
    ...items.map((i) => `- ${when(i.plannedAt)} · ${i.title} · ${i.channelName} · ${formatLabel(i.format)}`),
  ];
  if (previous) {
    lines.push(
      "",
      `Mes anterior (${formatPeriod(previous.period, project.locale)}):`,
      prevItems.length ? "Piezas:" : "No tuvo piezas.",
      ...prevItems
        .filter((i) => i.status !== "cancelled")
        .map((i) => `- ${when(i.plannedAt)} · ${i.title} · ${i.channelName} · ${formatLabel(i.format)}`),
      previous.learnings && `Aprendizajes: ${previous.learnings}`,
      prevMetrics.length ? "Métricas registradas:" : "No hay métricas registradas.",
      ...prevMetrics,
    );
  }
  return {
    cycleId: cycle.id,
    data: block(lines),
    inputRefs: {
      project: [ctx.projectId],
      ...brand.refs,
      cycle: previous ? [cycle.id, previous.id] : [cycle.id],
      // El orden importa: C1 es el primero, C2 el segundo…
      channel: active.map((c) => c.id),
      contentItem: [...items, ...prevItems].map((i) => i.id),
    },
  };
}

/**
 * Para la interpretación del informe: SOLO métricas registradas (con su variación,
 * calculada de forma determinista) y lo publicado. Ni el análisis del equipo ni
 * textos anteriores de la IA.
 */
export async function reportContext(ctx: ProjectContext, cycleId: string): Promise<BuiltContext> {
  const [project, cycle] = await Promise.all([getProject(ctx), getCycle(ctx, cycleId)]);
  const [summary, publications] = await Promise.all([
    getMetricSummary(ctx, { cycleId: cycle.id }),
    listCyclePublications(ctx, cycle.id),
  ]);
  const lines: string[] = [
    `Cliente: ${project.clientName}`,
    `Proyecto: ${project.name}`,
    `Idioma: ${project.locale}`,
    `Mes: ${formatPeriod(cycle.period, project.locale)}`,
  ];
  const active = summary.filter(({ channel, rows }) => channel.isActive || rows.some((r) => r.value !== null));
  for (const { channel, hasPrevious, rows } of active) {
    lines.push("", `Métricas de ${channel.displayName}${hasPrevious ? " (este mes · mes anterior · variación)" : ""}:`);
    for (const r of rows) {
      const unit = r.definition.unit;
      lines.push(
        `- ${r.definition.label}: ${formatMetric(r.value, unit)}` +
          (hasPrevious ? ` · ${formatMetric(r.previous, unit)} · ${formatChange(r.change)}` : ""),
      );
    }
  }
  lines.push("", `Piezas publicadas o programadas en el mes: ${publications.length}`);
  for (const p of publications) lines.push(`- ${p.title} · ${p.channelName} · ${formatLabel(p.format)}`);
  return {
    cycleId: cycle.id,
    data: lines.join("\n"),
    inputRefs: {
      project: [ctx.projectId],
      cycle: [cycle.id],
      channel: active.map((a) => a.channel.id),
      contentItem: publications.map((p) => p.itemId),
    },
  };
}
