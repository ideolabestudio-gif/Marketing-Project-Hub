import { z } from "zod";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { previousPeriod } from "@/lib/time";
import { isUniqueViolation, isUuid, parseInput } from "@/lib/validation";
import { authorize, type ProjectContext } from "@/modules/access/context";
import { recordAudit } from "@/modules/audit/service";
import { assertCycleWritable, getCycle, getCycleByPeriod } from "@/modules/cycles/service";
import { assertAdmin, type Actor } from "@/modules/identity/actor";
import { listChannels } from "@/modules/projects/service";
import {
  AGGREGATIONS,
  aggregateColumn,
  AGGREGATION_LABELS,
  CSV_LIMITS,
  CsvError,
  guessNumberFormat,
  NUMBER_FORMATS,
  parseCsv,
  parseNumber,
} from "./csv";
import * as repo from "./repo";

// Las métricas son DATOS ORIGINALES: siempre llevan su fuente y quién las registró, y
// nunca se calculan ni se estiman. Corregir = fila nueva que apunta a la anterior.

export type MetricDefinition = repo.DefinitionRow;

// ---------------------------------------------------------------------------
// Catálogo
// ---------------------------------------------------------------------------

/** Métricas activas del catálogo (para formularios e informes de un proyecto). */
export async function listMetricCatalog(ctx: ProjectContext): Promise<MetricDefinition[]> {
  await authorize(ctx, "project.read");
  return repo.listDefinitions({ activeOnly: true });
}

export async function adminListMetricDefinitions(actor: Actor): Promise<MetricDefinition[]> {
  assertAdmin(actor);
  return repo.listDefinitions();
}

const definitionFields = {
  label: z.string().trim().min(1, "Indica un nombre").max(80),
  description: z.string().trim().min(5, "Describe qué mide").max(1000),
  sourceNote: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => v || null),
  defaultAggregation: z.enum(["sum", "last", "average", "max"], "Agregación no válida"),
  position: z.coerce.number().int().min(0).max(10000).default(100),
};

const createDefinitionSchema = z.object({
  key: z
    .string()
    .trim()
    .regex(/^(social|email)\.[a-z0-9_]{2,40}$/, "Clave: social.xxx o email.xxx (minúsculas, números y _)"),
  unit: z.enum(["count", "percent", "currency", "seconds"], "Unidad no válida"),
  ...definitionFields,
});

export async function adminCreateMetricDefinition(actor: Actor, input: z.input<typeof createDefinitionSchema>) {
  assertAdmin(actor);
  const data = parseInput(createDefinitionSchema, input);
  try {
    await repo.insertDefinition({ ...data, kind: data.key.startsWith("email.") ? "email" : "social" });
  } catch (err) {
    if (isUniqueViolation(err)) throw new ConflictError("Ya existe una métrica con esa clave");
    throw err;
  }
  await recordAudit({ action: "metric_definition.created", actorId: actor.userId, entityType: "metric_definition", entityId: data.key });
}

const updateDefinitionSchema = z.object({
  key: z.string(),
  isActive: z.boolean(),
  ...definitionFields,
});

/** Edita nombre, descripción, agregación propuesta u orden. La clave y la unidad no cambian. */
export async function adminUpdateMetricDefinition(actor: Actor, input: z.input<typeof updateDefinitionSchema>) {
  assertAdmin(actor);
  const { key, ...data } = parseInput(updateDefinitionSchema, input);
  if (!(await repo.updateDefinition(key, data))) throw new NotFoundError();
  await recordAudit({ action: "metric_definition.updated", actorId: actor.userId, entityType: "metric_definition", entityId: key });
}

// ---------------------------------------------------------------------------
// Valores del ciclo
// ---------------------------------------------------------------------------

/** Métricas de un ciclo: valores vigentes, historial de correcciones e importaciones. */
export async function getCycleMetrics(ctx: ProjectContext, cycleId: string) {
  await authorize(ctx, "project.read");
  const cycle = await getCycle(ctx, cycleId);
  const [values, imports, definitions, channels] = await Promise.all([
    repo.listValuesForCycle(ctx, cycle.id),
    repo.listImportsForCycle(ctx, cycle.id),
    repo.listDefinitions(),
    listChannels(ctx),
  ]);
  return {
    cycle,
    channels,
    definitions,
    values: values.map((v) => ({ ...v.value, isCurrent: v.isCurrent, capturedByName: v.capturedByName ?? v.capturedByEmail })),
    imports,
  };
}

async function loadWritableChannel(ctx: ProjectContext, cycleId: string, channelId: string) {
  await authorize(ctx, "metrics.write");
  const cycle = await getCycle(ctx, cycleId);
  assertCycleWritable(cycle);
  const channel = (await listChannels(ctx)).find((c) => c.id === channelId);
  if (!channel) throw new NotFoundError("Canal no encontrado");
  return { cycle, channel };
}

async function loadDefinitionFor(kind: "social" | "email", key: string) {
  const def = await repo.findDefinition(key);
  if (!def || !def.isActive) throw new ValidationError("Métrica no válida");
  if (def.kind !== kind) throw new ValidationError(`«${def.label}» no aplica a este tipo de canal`);
  return def;
}

const manualSchema = z.object({
  cycleId: z.string(),
  channelId: z.string(),
  metricKey: z.string().min(1, "Elige una métrica"),
  value: z.string().trim().min(1, "Indica el valor"),
  numberFormat: z.enum(NUMBER_FORMATS).default("es"),
  note: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => v || null),
});

/**
 * Registra a mano el valor de una métrica para el canal en el ciclo. Si ya había uno,
 * lo corrige (y se exige un motivo); el anterior queda en el historial.
 */
export async function recordMetricValue(ctx: ProjectContext, input: z.input<typeof manualSchema>) {
  const data = parseInput(manualSchema, input);
  const { cycle, channel } = await loadWritableChannel(ctx, data.cycleId, data.channelId);
  const def = await loadDefinitionFor(channel.kind, data.metricKey);
  const value = parseNumber(data.value, data.numberFormat);
  if (value === null || Number.isNaN(value)) throw new ValidationError("El valor no es un número");
  if (def.unit === "percent" && (value < 0 || value > 100)) throw new ValidationError("Un porcentaje va de 0 a 100");

  const existing = (await repo.listValuesForCycle(ctx, cycle.id)).find(
    (v) => v.isCurrent && v.value.channelId === channel.id && v.value.metricKey === def.key && !v.value.contentItemId,
  );
  if (existing && !data.note) throw new ValidationError("Ya hay un valor: indica el motivo de la corrección");

  const [row] = await repo.insertValues(ctx, [
    {
      cycleId: cycle.id,
      channelId: channel.id,
      metricKey: def.key,
      value,
      source: "manual",
      importId: null,
      sourceDetail: null,
      note: data.note,
    },
  ]);
  await recordAudit({
    action: row.supersedesId ? "metric_value.corrected" : "metric_value.recorded",
    actorId: ctx.actor.userId,
    projectId: ctx.projectId,
    entityType: "metric_value",
    entityId: row.id,
    data: { metricKey: def.key, channelId: channel.id, value },
  });
  return row;
}

// ---------------------------------------------------------------------------
// Importación de CSV (genérica: la persona indica qué columna es cada métrica)
// ---------------------------------------------------------------------------

/** Sube un CSV. Se guarda tal cual (dato original) y queda pendiente de asignar columnas. */
export async function uploadMetricCsv(
  ctx: ProjectContext,
  input: { cycleId: string; channelId: string; filename: string; text: string },
) {
  const { cycle, channel } = await loadWritableChannel(ctx, input.cycleId, input.channelId);
  if (Buffer.byteLength(input.text, "utf8") > CSV_LIMITS.maxBytes) {
    throw new ValidationError("El archivo es demasiado grande (máximo 1 MB)");
  }
  let rowCount: number;
  try {
    rowCount = parseCsv(input.text).rows.length;
  } catch (err) {
    if (err instanceof CsvError) throw new ValidationError(err.message);
    throw err;
  }
  const filename = (input.filename.split(/[\\/]/).pop() || "metricas.csv").slice(0, 150);
  const row = await repo.insertImport(ctx, { cycleId: cycle.id, channelId: channel.id, filename, rawCsv: input.text, rowCount });
  await recordAudit({
    action: "metric_import.uploaded",
    actorId: ctx.actor.userId,
    projectId: ctx.projectId,
    entityType: "metric_import",
    entityId: row.id,
    data: { filename, rowCount },
  });
  return row;
}

function normalize(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Palabras en inglés habituales en exportaciones, para proponer columnas. */
const HINTS: Record<string, string[]> = {
  followers: ["followers", "seguidores", "fans"],
  followers_gained: ["new followers", "nuevos seguidores", "followers gained"],
  posts: ["posts", "publicaciones"],
  reach: ["reach", "alcance"],
  impressions: ["impressions", "impresiones", "views"],
  interactions: ["interactions", "interacciones", "engagement"],
  engagement_rate: ["engagement rate", "tasa de interaccion", "er"],
  video_views: ["video views", "reproducciones"],
  link_clicks: ["link clicks", "clics en enlaces", "clicks"],
  profile_visits: ["profile visits", "visitas al perfil"],
  subscribers: ["subscribers", "suscriptores"],
  opens: ["opens", "unique opens", "aperturas"],
  open_rate: ["open rate", "tasa de apertura"],
  clicks: ["clicks", "unique clicks", "clics"],
  click_rate: ["click rate", "tasa de clics", "ctr"],
  unsubscribes: ["unsubscribes", "bajas"],
  bounces: ["bounces", "rebotes"],
  recipients: ["recipients", "sent", "destinatarios", "enviados"],
  campaigns_sent: ["campaigns", "campanas"],
};

function suggestColumn(def: MetricDefinition, headers: string[]): number | null {
  const candidates = [def.label, ...(HINTS[def.key.split(".")[1]] ?? [])].map(normalize);
  const normalized = headers.map(normalize);
  for (const c of candidates) {
    const exact = normalized.indexOf(c);
    if (exact >= 0) return exact;
  }
  return null;
}

async function loadImport(ctx: ProjectContext, importId: string) {
  const row = isUuid(importId) ? await repo.findImport(ctx, importId) : undefined;
  if (!row) throw new NotFoundError();
  return row;
}

/** Vista previa de una importación: cabeceras, primeras filas y una propuesta de columnas. */
export async function getMetricImport(ctx: ProjectContext, importId: string) {
  await authorize(ctx, "project.read");
  const imp = await loadImport(ctx, importId);
  const csv = parseCsv(imp.rawCsv);
  const channel = (await listChannels(ctx)).find((c) => c.id === imp.channelId);
  if (!channel) throw new NotFoundError();
  const definitions = (await repo.listDefinitions({ activeOnly: true })).filter((d) => d.kind === channel.kind);
  return {
    import: { ...imp, rawCsv: undefined },
    channel,
    headers: csv.headers,
    previewRows: csv.rows.slice(0, 8),
    suggestedFormat: guessNumberFormat(csv),
    suggestions: definitions.map((d) => ({
      definition: d,
      column: suggestColumn(d, csv.headers),
      aggregation: d.defaultAggregation,
    })),
    aggregationLabels: AGGREGATION_LABELS,
  };
}

const applySchema = z.object({
  importId: z.string(),
  numberFormat: z.enum(NUMBER_FORMATS),
  mappings: z
    .array(
      z.object({
        metricKey: z.string(),
        column: z.number().int().min(0),
        aggregation: z.enum(AGGREGATIONS),
      }),
    )
    .min(1, "Asigna al menos una columna a una métrica")
    .max(50),
});

/**
 * Aplica una importación: calcula cada métrica a partir de su columna (suma, última
 * fila…) de forma determinista y deja constancia exacta de cómo se calculó.
 */
export async function applyMetricImport(ctx: ProjectContext, input: z.input<typeof applySchema>) {
  const data = parseInput(applySchema, input);
  const imp = await loadImport(ctx, data.importId);
  if (imp.status !== "pending") throw new ValidationError("Esta importación ya se aplicó o se descartó");
  const { cycle, channel } = await loadWritableChannel(ctx, imp.cycleId, imp.channelId);
  const csv = parseCsv(imp.rawCsv);
  if (new Set(data.mappings.map((m) => m.metricKey)).size !== data.mappings.length) {
    throw new ValidationError("Cada métrica solo puede tomarse de una columna");
  }

  const values: repo.NewValue[] = [];
  for (const m of data.mappings) {
    const def = await loadDefinitionFor(channel.kind, m.metricKey);
    if (m.column >= csv.headers.length) throw new ValidationError("Columna no válida");
    let result;
    try {
      result = aggregateColumn(csv, m.column, m.aggregation, data.numberFormat);
    } catch (err) {
      if (err instanceof CsvError) throw new ValidationError(`${def.label}: ${err.message}`);
      throw err;
    }
    values.push({
      cycleId: cycle.id,
      channelId: channel.id,
      metricKey: def.key,
      value: result.value,
      source: "csv_import",
      importId: imp.id,
      sourceDetail: `${imp.filename} · columna «${csv.headers[m.column]}» · ${AGGREGATION_LABELS[m.aggregation].toLowerCase()}${
        m.aggregation === "last" || m.aggregation === "first"
          ? ""
          : ` (${result.usedRows} ${result.usedRows === 1 ? "fila" : "filas"})`
      }`,
      note: null,
    });
  }
  const rows = await repo.insertValues(ctx, values, { resolveImportId: imp.id });
  await recordAudit({
    action: "metric_import.applied",
    actorId: ctx.actor.userId,
    projectId: ctx.projectId,
    entityType: "metric_import",
    entityId: imp.id,
    data: { metrics: values.map((v) => v.metricKey), numberFormat: data.numberFormat },
  });
  return rows;
}

export async function discardMetricImport(ctx: ProjectContext, input: { importId: string }) {
  await authorize(ctx, "metrics.write");
  const imp = await loadImport(ctx, input.importId);
  if (!(await repo.discardImport(ctx, imp.id))) throw new ValidationError("Esta importación ya está resuelta");
  await recordAudit({
    action: "metric_import.discarded",
    actorId: ctx.actor.userId,
    projectId: ctx.projectId,
    entityType: "metric_import",
    entityId: imp.id,
  });
}

// ---------------------------------------------------------------------------
// Resumen para el informe
// ---------------------------------------------------------------------------

export type MetricSummaryRow = {
  channelId: string;
  definition: MetricDefinition;
  value: number | null;
  previous: number | null;
  /** Variación porcentual respecto al mes anterior; null si falta alguno de los dos datos. */
  change: number | null;
  source: string | null;
};

/**
 * Valores del ciclo y del mes anterior, por canal y métrica del catálogo. Si falta un
 * dato se devuelve null ("sin dato"): nunca se estima ni se rellena.
 */
export async function getMetricSummary(ctx: ProjectContext, input: { cycleId: string; channelId?: string | null }) {
  await authorize(ctx, "project.read");
  const cycle = await getCycle(ctx, input.cycleId);
  let previousCycleId: string | null = null;
  try {
    previousCycleId = (await getCycleByPeriod(ctx, previousPeriod(cycle.period))).id;
  } catch (err) {
    if (!(err instanceof NotFoundError)) throw err;
  }
  const [channels, definitions, values] = await Promise.all([
    listChannels(ctx),
    repo.listDefinitions(),
    repo.currentChannelValues(ctx, [cycle.id, ...(previousCycleId ? [previousCycleId] : [])]),
  ]);
  const selected = channels.filter((c) => (input.channelId ? c.id === input.channelId : true));
  if (input.channelId && selected.length === 0) throw new NotFoundError("Canal no encontrado");
  const find = (cycleId: string | null, channelId: string, key: string) =>
    cycleId ? values.find((v) => v.cycleId === cycleId && v.channelId === channelId && v.metricKey === key) : undefined;

  return selected.map((channel) => {
    const rows: MetricSummaryRow[] = definitions
      .filter((d) => d.kind === channel.kind)
      .map((d) => {
        const cur = find(cycle.id, channel.id, d.key);
        const prev = find(previousCycleId, channel.id, d.key);
        const value = cur ? cur.value : null;
        const previous = prev ? prev.value : null;
        const change = value !== null && previous !== null && previous !== 0 ? ((value - previous) / previous) * 100 : null;
        return { channelId: channel.id, definition: d, value, previous, change, source: cur?.source ?? null };
      })
      // Se muestran las métricas activas y cualquier métrica con datos en algún mes.
      .filter((r) => r.definition.isActive || r.value !== null || r.previous !== null);
    return { channel, hasPrevious: previousCycleId !== null, rows };
  });
}
