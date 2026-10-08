import { z } from "zod";
import { AiUnavailableError, getAiProvider } from "@/lib/ai";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { nextPeriod, periodOfWallTime, wallTimeToUtc } from "@/lib/time";
import { isUuid, parseInput } from "@/lib/validation";
import { authorize, hasPermission, type ProjectContext } from "@/modules/access/context";
import { recordAudit } from "@/modules/audit/service";
import { addComment, createItem, getItemDetail, saveVersion } from "@/modules/content/service";
import { assertCycleWritable, getCycle, getCycleByPeriod, openCycle, type Cycle } from "@/modules/cycles/service";
import { getProject, listChannels } from "@/modules/projects/service";
import { addAiInterpretationSection } from "@/modules/reports/service";
import { CHAT_RESPONSE_FORMAT, calendarPlanJsonSchema, parseCalendarPlan, type CalendarProposal } from "./calendar-plan";
import { calendarPlanContext, copyDraftContext, ideasContext, reportContext, type BuiltContext } from "./context";
import { findUnverifiedNumbers } from "./numbers";
import { CALENDAR_PLAN, COPY_DRAFT, IDEAS, REPORT_INTERPRETATION, type PromptTemplate } from "./prompts";
import * as repo from "./repo";

// La IA solo genera borradores. Nada de lo que devuelve cambia contenidos ni informes:
// se guarda en ai_generations y una persona decide si lo usa (y entonces se crea una
// versión o una sección nueva que apunta a la generación).

export type Generation = repo.GenerationRow;

export const PURPOSE_LABELS: Record<Generation["purpose"], string> = {
  copy_draft: "Borrador de texto",
  ideas: "Ideas de contenido",
  report_interpretation: "Interpretación del informe",
  calendar_plan: "Propuesta de calendario",
};

function monthStartUtc(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** Estado de la IA en el proyecto: si está configurada, activada y cuánto se ha gastado. */
export async function getAiStatus(ctx: ProjectContext) {
  await authorize(ctx, "project.read");
  const project = await getProject(ctx);
  const provider = getAiProvider();
  const spentUsd = await repo.spentSince(ctx, monthStartUtc());
  return {
    configured: provider.name !== "disabled",
    enabled: project.aiEnabled,
    model: provider.model,
    limitUsd: project.aiMonthlyLimitUsd,
    spentUsd,
  };
}

const instructionsSchema = z
  .string()
  .trim()
  .max(2000, "Las indicaciones son demasiado largas")
  .optional()
  .transform((v) => v || null);

/** Comprueba permiso, que la IA está activada en el proyecto y configurada en el servidor. */
async function assertAiAvailable(ctx: ProjectContext) {
  await authorize(ctx, "ai.generate");
  const project = await getProject(ctx);
  // AI-04: desactivada por defecto en cada proyecto.
  if (!project.aiEnabled) throw new ForbiddenError("La IA está desactivada en este proyecto (Ajustes)");
  const provider = getAiProvider();
  if (provider.name === "disabled") throw new ValidationError(new AiUnavailableError().message);
  return { project, provider };
}

/** Datos entre <datos> y, aparte, lo que pide la persona. */
function buildPrompt(context: BuiltContext, instructions: string | null): string {
  return [
    `<datos>\n${context.data}\n</datos>`,
    instructions ? `Indicaciones de la persona que lo pide:\n${instructions}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");
}

async function generate(
  ctx: ProjectContext,
  input: {
    template: PromptTemplate;
    purpose: Generation["purpose"];
    contentItemId: string | null;
    instructions: string | null;
    build: () => Promise<BuiltContext>;
    /** Salida estructurada: esquema JSON según el contexto construido. */
    jsonSchema?: (context: BuiltContext) => Record<string, unknown>;
  },
): Promise<Generation> {
  const { project, provider } = await assertAiAvailable(ctx);

  // AI-01: el contexto se construye antes de llamar al proveedor; un ID ajeno falla aquí.
  const context = await input.build();
  const cycle = await getCycle(ctx, context.cycleId);
  if (cycle.status === "closed") throw new ForbiddenError("El ciclo está cerrado");

  const spent = await repo.spentSince(ctx, monthStartUtc());
  if (spent + provider.maxCostPerRequestUsd > project.aiMonthlyLimitUsd) {
    throw new ValidationError(
      `Se ha alcanzado el límite de gasto de IA del mes (${project.aiMonthlyLimitUsd} USD; gastado ${spent.toFixed(2)} USD)`,
    );
  }

  const prompt = buildPrompt(context, input.instructions);
  const result = await provider.generate({
    system: input.template.system,
    prompt,
    effort: input.template.effort,
    ...(input.jsonSchema ? { jsonSchema: input.jsonSchema(context) } : {}),
  });

  const row = await repo.insertGeneration(ctx, {
    cycleId: cycle.id,
    contentItemId: input.contentItemId,
    purpose: input.purpose,
    provider: provider.name,
    model: result.model,
    promptTemplate: input.template.key,
    promptTemplateVersion: input.template.version,
    instructions: input.instructions,
    inputRefs: context.inputRefs,
    output: result.ok ? result.text : "",
    error: result.ok ? null : result.error,
    status: result.ok ? "draft" : "failed",
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    costUsd: result.costUsd,
  });
  await recordAudit({
    action: result.ok ? "ai.generated" : "ai.failed",
    actorId: ctx.actor.userId,
    projectId: ctx.projectId,
    entityType: "ai_generation",
    entityId: row.id,
    data: { purpose: input.purpose, model: result.model, costUsd: result.costUsd },
  });
  if (!result.ok) throw new ValidationError(`La IA no ha devuelto un borrador: ${result.error}`);
  return row;
}

const copySchema = z.object({ itemId: z.string(), instructions: instructionsSchema });

/** Borrador de texto para una pieza. No crea ninguna versión. */
export async function generateCopyDraft(ctx: ProjectContext, input: z.input<typeof copySchema>) {
  const data = parseInput(copySchema, input);
  const { item } = await getItemDetail(ctx, data.itemId);
  return generate(ctx, {
    template: COPY_DRAFT,
    purpose: "copy_draft",
    contentItemId: item.id,
    instructions: data.instructions,
    build: () => copyDraftContext(ctx, item.id),
  });
}

const cycleSchema = z.object({ cycleId: z.string(), instructions: instructionsSchema });

/** Ideas de contenido para el mes. No crea piezas. */
export async function generateIdeas(ctx: ProjectContext, input: z.input<typeof cycleSchema>) {
  const data = parseInput(cycleSchema, input);
  return generate(ctx, {
    template: IDEAS,
    purpose: "ideas",
    contentItemId: null,
    instructions: data.instructions,
    build: () => ideasContext(ctx, data.cycleId),
  });
}

/**
 * Propuesta de calendario para el mes del ciclo (piezas con fecha, canal y formato).
 * No crea piezas: una persona elige cuáles añadir con applyCalendarPlan.
 */
export async function generateCalendarPlan(ctx: ProjectContext, input: z.input<typeof cycleSchema>) {
  const data = parseInput(cycleSchema, input);
  return generate(ctx, {
    template: CALENDAR_PLAN,
    purpose: "calendar_plan",
    contentItemId: null,
    instructions: data.instructions,
    build: async () => {
      const context = await calendarPlanContext(ctx, data.cycleId);
      if (context.inputRefs.channel.length === 0) throw new ValidationError("El proyecto no tiene canales activos");
      return context;
    },
    jsonSchema: (context) => calendarPlanJsonSchema(context.inputRefs.channel.length),
  });
}

const prepareSchema = z.object({ instructions: instructionsSchema });

/**
 * La orden «prepara el calendario del mes que viene»: abre el ciclo del mes siguiente
 * (en la zona del proyecto) si aún no existe y, si la IA está activada y configurada,
 * pide la propuesta de calendario. Sin IA (generation = null) la propuesta se prepara
 * en un chat de Claude y se pega con importCalendarPlan.
 * Abrir el ciclo exige cycle.manage.
 */
export async function prepareNextMonthCalendar(
  ctx: ProjectContext,
  input: z.input<typeof prepareSchema>,
): Promise<{ cycle: Cycle; generation: Generation | null }> {
  const data = parseInput(prepareSchema, input);
  await authorize(ctx, "ai.generate");
  await authorize(ctx, "content.write");
  const project = await getProject(ctx);
  const useApi = project.aiEnabled && getAiProvider().name !== "disabled";
  const period = nextPeriod(new Date(), project.timezone);
  let cycle: Cycle;
  try {
    cycle = await getCycleByPeriod(ctx, period);
  } catch (err) {
    if (!(err instanceof NotFoundError)) throw err;
    if (!hasPermission(ctx, "cycle.manage")) {
      throw new ForbiddenError("El ciclo del mes que viene no está abierto; pide a la persona responsable que lo abra");
    }
    cycle = await openCycle(ctx, { period });
  }
  assertCycleWritable(cycle);
  const generation = useApi
    ? await generateCalendarPlan(ctx, { cycleId: cycle.id, instructions: data.instructions ?? undefined })
    : null;
  return { cycle, generation };
}

/**
 * Sin API: el texto completo (instrucciones + datos del proyecto) para pegarlo en un
 * chat de Claude. No llama a ningún proveedor ni guarda nada.
 */
export async function getCalendarPlanChatPrompt(ctx: ProjectContext, input: z.input<typeof cycleSchema>) {
  const data = parseInput(cycleSchema, input);
  await authorize(ctx, "ai.generate");
  const context = await calendarPlanContext(ctx, data.cycleId);
  if (context.inputRefs.channel.length === 0) throw new ValidationError("El proyecto no tiene canales activos");
  return [CALENDAR_PLAN.system, CHAT_RESPONSE_FORMAT, buildPrompt(context, data.instructions)].join("\n\n");
}

const importSchema = z.object({
  cycleId: z.string(),
  output: z.string().trim().min(1, "Pega la respuesta del chat").max(50000, "El texto es demasiado largo"),
  instructions: instructionsSchema,
});

/**
 * Guarda como propuesta de calendario la respuesta pegada desde un chat de Claude.
 * Queda en ai_generations igual que una generada por la API (sin coste) y se revisa y
 * se añade al calendario con applyCalendarPlan. No crea piezas.
 */
export async function importCalendarPlan(ctx: ProjectContext, input: z.input<typeof importSchema>) {
  const data = parseInput(importSchema, input);
  await authorize(ctx, "ai.generate");
  const context = await calendarPlanContext(ctx, data.cycleId);
  const cycle = await getCycle(ctx, context.cycleId);
  assertCycleWritable(cycle);
  const [project, channels] = await Promise.all([getProject(ctx), listChannels(ctx)]);
  const { proposals } = parseCalendarPlan(data.output, {
    channelIds: context.inputRefs.channel,
    channels,
    period: cycle.period,
    timezone: project.timezone,
  });
  if (proposals.length === 0) {
    throw new ValidationError("No hay ninguna pieza válida en el texto pegado: copia la respuesta completa del chat");
  }
  const row = await repo.insertGeneration(ctx, {
    cycleId: cycle.id,
    contentItemId: null,
    purpose: "calendar_plan",
    provider: "chat",
    model: "Chat de Claude (pegado)",
    promptTemplate: CALENDAR_PLAN.key,
    promptTemplateVersion: CALENDAR_PLAN.version,
    instructions: data.instructions,
    inputRefs: context.inputRefs,
    output: data.output,
    error: null,
    status: "draft",
    inputTokens: 0,
    outputTokens: 0,
    costUsd: 0,
  });
  await recordAudit({
    action: "ai.imported",
    actorId: ctx.actor.userId,
    projectId: ctx.projectId,
    entityType: "ai_generation",
    entityId: row.id,
    data: { purpose: "calendar_plan" },
  });
  return row;
}

/** Lectura de las métricas registradas para el informe. No toca el informe. */
export async function generateReportInterpretation(ctx: ProjectContext, input: z.input<typeof cycleSchema>) {
  const data = parseInput(cycleSchema, input);
  return generate(ctx, {
    template: REPORT_INTERPRETATION,
    purpose: "report_interpretation",
    contentItemId: null,
    instructions: data.instructions,
    build: () => reportContext(ctx, data.cycleId),
  });
}

/**
 * Generaciones de una pieza o de un ciclo, con lo necesario para revisarlas. Para las
 * interpretaciones, `unverifiedNumbers` lista cifras que no estaban en los datos.
 */
export async function listGenerations(
  ctx: ProjectContext,
  input: { cycleId: string; contentItemId?: string; purpose?: Generation["purpose"] },
) {
  await authorize(ctx, "project.read");
  const cycle = await getCycle(ctx, input.cycleId);
  let itemId: string | undefined;
  if (input.contentItemId) {
    const { item } = await getItemDetail(ctx, input.contentItemId);
    if (item.cycleId !== cycle.id) throw new NotFoundError();
    itemId = item.id;
  }
  const rows = await repo.listGenerations(ctx, { cycleId: cycle.id, contentItemId: itemId, purpose: input.purpose });
  const needsCheck = rows.some((r) => r.generation.purpose === "report_interpretation" && r.generation.status === "draft");
  const data = needsCheck ? (await reportContext(ctx, cycle.id)).data : "";
  const readPlan = rows.some((r) => r.generation.purpose === "calendar_plan") ? await calendarPlanReader(ctx, cycle) : null;
  return rows.map(({ generation, requestedByName, requestedByEmail }) => ({
    ...generation,
    requestedByName: requestedByName ?? requestedByEmail,
    unverifiedNumbers:
      generation.purpose === "report_interpretation" && generation.status === "draft"
        ? findUnverifiedNumbers(generation.output, data)
        : [],
    plan: readPlan && generation.purpose === "calendar_plan" ? readPlan(generation) : null,
  }));
}

/** Lee las propuestas de calendario con los canales actuales del proyecto. */
async function calendarPlanReader(ctx: ProjectContext, cycle: Cycle) {
  const [project, channels] = await Promise.all([getProject(ctx), listChannels(ctx)]);
  return (generation: Generation) =>
    parseCalendarPlan(generation.output, {
      channelIds: generation.inputRefs.channel ?? [],
      channels,
      period: cycle.period,
      timezone: project.timezone,
    });
}

async function loadDraft(ctx: ProjectContext, generationId: string, purpose: Generation["purpose"]) {
  const generation = isUuid(generationId) ? await repo.findGeneration(ctx, generationId) : undefined;
  if (!generation || generation.purpose !== purpose) throw new NotFoundError();
  if (generation.status !== "draft") throw new ValidationError("Este borrador ya se usó o se descartó");
  return generation;
}

async function markResolved(ctx: ProjectContext, generationId: string, status: "used" | "discarded") {
  if (!(await repo.resolveGeneration(ctx, generationId, status))) {
    throw new ValidationError("Este borrador ya se usó o se descartó");
  }
  await recordAudit({
    action: status === "used" ? "ai.used" : "ai.discarded",
    actorId: ctx.actor.userId,
    projectId: ctx.projectId,
    entityType: "ai_generation",
    entityId: generationId,
  });
}

const useCopySchema = z.object({
  generationId: z.string(),
  body: z.string().max(20000),
  emailSubject: z.string().optional(),
  emailPreheader: z.string().optional(),
  linkUrl: z.string().optional(),
  note: z.string().optional(),
});

/**
 * Crea una versión nueva de la pieza a partir del borrador (WF-05: origin ai_assisted
 * y enlazada a la generación). La persona puede haber editado el texto antes.
 * La versión nace sin aprobaciones, como cualquier otra.
 */
export async function applyCopyDraft(ctx: ProjectContext, input: z.input<typeof useCopySchema>) {
  const data = parseInput(useCopySchema, input);
  await authorize(ctx, "content.write");
  const generation = await loadDraft(ctx, data.generationId, "copy_draft");
  const version = await saveVersion(ctx, {
    itemId: generation.contentItemId!,
    body: data.body,
    emailSubject: data.emailSubject,
    emailPreheader: data.emailPreheader,
    linkUrl: data.linkUrl,
    note: data.note || "Desde un borrador de IA",
    aiGenerationId: generation.id,
  });
  await markResolved(ctx, generation.id, "used");
  return version;
}

const useInterpretationSchema = z.object({ generationId: z.string(), title: z.string(), body: z.string() });

/** Añade la interpretación (editada o no) al informe como sección marcada y sin revisar. */
export async function applyReportInterpretation(ctx: ProjectContext, input: z.input<typeof useInterpretationSchema>) {
  const data = parseInput(useInterpretationSchema, input);
  await authorize(ctx, "report.write");
  const generation = await loadDraft(ctx, data.generationId, "report_interpretation");
  const section = await addAiInterpretationSection(ctx, {
    cycleId: generation.cycleId,
    aiGenerationId: generation.id,
    title: data.title,
    body: data.body,
  });
  await markResolved(ctx, generation.id, "used");
  return section;
}

const applyPlanSchema = z.object({
  generationId: z.string(),
  entries: z
    .array(
      z.object({
        index: z.number().int().min(0),
        title: z.string().trim().min(1, "Indica un título").max(200),
        plannedAt: z.string().trim(),
        idea: z.string().trim().max(2000).optional(),
      }),
    )
    .min(1, "Marca al menos una pieza")
    .max(100),
});

/**
 * Añade al calendario las piezas que una persona eligió de la propuesta (con el
 * título y la fecha que haya ajustado). Cada pieza nace como idea, sin versiones ni
 * aprobaciones, enlazada a la generación; la idea queda como comentario de quien la añade.
 */
export async function applyCalendarPlan(ctx: ProjectContext, input: z.input<typeof applyPlanSchema>) {
  const data = parseInput(applyPlanSchema, input);
  await authorize(ctx, "content.write");
  const generation = await loadDraft(ctx, data.generationId, "calendar_plan");
  const cycle = await getCycle(ctx, generation.cycleId);
  assertCycleWritable(cycle);
  const { proposals } = (await calendarPlanReader(ctx, cycle))(generation);
  const project = await getProject(ctx);

  // Todo se valida antes de crear nada, para no dejar la propuesta a medias.
  const seen = new Set<number>();
  const picks: { proposal: CalendarProposal; title: string; plannedAt: string; idea: string }[] = [];
  for (const entry of data.entries) {
    const proposal = proposals.find((p) => p.index === entry.index);
    if (!proposal || seen.has(entry.index)) throw new ValidationError("Esa propuesta no existe o está repetida");
    seen.add(entry.index);
    if (!wallTimeToUtc(entry.plannedAt, project.timezone)) throw new ValidationError("Fecha no válida");
    if (periodOfWallTime(entry.plannedAt) !== cycle.period) {
      throw new ValidationError("La fecha debe estar dentro del mes del ciclo");
    }
    picks.push({ proposal, title: entry.title, plannedAt: entry.plannedAt, idea: entry.idea ?? "" });
  }

  await markResolved(ctx, generation.id, "used");
  const canComment = hasPermission(ctx, "comment.write");
  const items = [];
  for (const pick of picks) {
    const item = await createItem(
      ctx,
      {
        cycleId: cycle.id,
        channelId: pick.proposal.channelId,
        format: pick.proposal.format,
        title: pick.title,
        plannedAt: pick.plannedAt,
      },
      { fromAiGenerationId: generation.id },
    );
    if (pick.idea && canComment) await addComment(ctx, { itemId: item.id, body: `Idea: ${pick.idea}` });
    items.push(item);
  }
  return items;
}

/** Las ideas no crean nada: la persona las marca como aprovechadas o las descarta. */
export async function resolveGeneration(
  ctx: ProjectContext,
  input: { generationId: string; status: "used" | "discarded" },
) {
  await authorize(ctx, "ai.generate");
  const generation = isUuid(input.generationId) ? await repo.findGeneration(ctx, input.generationId) : undefined;
  if (!generation) throw new NotFoundError();
  if (input.status === "used" && generation.purpose !== "ideas") {
    throw new ValidationError("Este borrador se usa creando una versión o una sección");
  }
  if (input.status !== "used" && input.status !== "discarded") throw new ValidationError("Estado no válido");
  await markResolved(ctx, generation.id, input.status);
}
