import { z } from "zod";
import { AiUnavailableError, getAiProvider } from "@/lib/ai";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { isUuid, parseInput } from "@/lib/validation";
import { authorize, type ProjectContext } from "@/modules/access/context";
import { recordAudit } from "@/modules/audit/service";
import { getItemDetail, saveVersion } from "@/modules/content/service";
import { getCycle } from "@/modules/cycles/service";
import { getProject } from "@/modules/projects/service";
import { addAiInterpretationSection } from "@/modules/reports/service";
import { copyDraftContext, ideasContext, reportContext, type BuiltContext } from "./context";
import { findUnverifiedNumbers } from "./numbers";
import { COPY_DRAFT, IDEAS, REPORT_INTERPRETATION, type PromptTemplate } from "./prompts";
import * as repo from "./repo";

// La IA solo genera borradores. Nada de lo que devuelve cambia contenidos ni informes:
// se guarda en ai_generations y una persona decide si lo usa (y entonces se crea una
// versión o una sección nueva que apunta a la generación).

export type Generation = repo.GenerationRow;

export const PURPOSE_LABELS: Record<Generation["purpose"], string> = {
  copy_draft: "Borrador de texto",
  ideas: "Ideas de contenido",
  report_interpretation: "Interpretación del informe",
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

async function generate(
  ctx: ProjectContext,
  input: {
    template: PromptTemplate;
    purpose: Generation["purpose"];
    contentItemId: string | null;
    instructions: string | null;
    build: () => Promise<BuiltContext>;
  },
): Promise<Generation> {
  await authorize(ctx, "ai.generate");
  const project = await getProject(ctx);
  // AI-04: desactivada por defecto en cada proyecto.
  if (!project.aiEnabled) throw new ForbiddenError("La IA está desactivada en este proyecto (Ajustes)");
  const provider = getAiProvider();
  if (provider.name === "disabled") throw new ValidationError(new AiUnavailableError().message);

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

  const prompt = [
    `<datos>\n${context.data}\n</datos>`,
    input.instructions ? `Indicaciones de la persona que lo pide:\n${input.instructions}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");
  const result = await provider.generate({ system: input.template.system, prompt, effort: input.template.effort });

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
  return rows.map(({ generation, requestedByName, requestedByEmail }) => ({
    ...generation,
    requestedByName: requestedByName ?? requestedByEmail,
    unverifiedNumbers:
      generation.purpose === "report_interpretation" && generation.status === "draft"
        ? findUnverifiedNumbers(generation.output, data)
        : [],
  }));
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
