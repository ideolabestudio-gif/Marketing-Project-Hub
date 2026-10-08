"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { formString, runAction, type ActionState } from "@/lib/action-state";
import { projectContextForAction } from "@/lib/project-page";
import {
  applyCalendarPlan,
  generateCalendarPlan,
  importCalendarPlan,
  prepareNextMonthCalendar,
  generateCopyDraft,
  generateIdeas,
  generateReportInterpretation,
  resolveGeneration,
  applyCopyDraft,
  applyReportInterpretation,
} from "@/modules/ai/service";

// Acciones de IA compartidas por la pieza, el ciclo y el informe. Ninguna publica ni
// cambia nada por sí sola: generar guarda un borrador; usarlo es una acción humana.

export async function generateCopyDraftAction(projectId: string, itemId: string, _: ActionState, formData: FormData) {
  return runAction(async () => {
    const ctx = await projectContextForAction(projectId, "ai.generate");
    await generateCopyDraft(ctx, { itemId, instructions: formString(formData, "instructions") });
    revalidatePath(`/p/${projectId}`, "layout");
  }, "Borrador generado: revísalo abajo");
}

export async function applyCopyDraftAction(projectId: string, generationId: string, _: ActionState, formData: FormData) {
  return runAction(async () => {
    const ctx = await projectContextForAction(projectId, "content.write");
    await applyCopyDraft(ctx, {
      generationId,
      body: formString(formData, "body"),
      emailSubject: formString(formData, "emailSubject"),
      emailPreheader: formString(formData, "emailPreheader"),
      note: formString(formData, "note"),
    });
    revalidatePath(`/p/${projectId}`, "layout");
  }, "Versión creada a partir del borrador");
}

export async function generateIdeasAction(projectId: string, cycleId: string, _: ActionState, formData: FormData) {
  return runAction(async () => {
    const ctx = await projectContextForAction(projectId, "ai.generate");
    await generateIdeas(ctx, { cycleId, instructions: formString(formData, "instructions") });
    revalidatePath(`/p/${projectId}`, "layout");
  }, "Ideas generadas");
}

/** «Prepara el calendario del mes que viene»: abre el ciclo si hace falta y propone piezas. */
export async function prepareNextMonthCalendarAction(projectId: string, _: ActionState, formData: FormData) {
  let period: string | undefined;
  const result = await runAction(async () => {
    const ctx = await projectContextForAction(projectId, "ai.generate");
    const { cycle } = await prepareNextMonthCalendar(ctx, { instructions: formString(formData, "instructions") });
    period = cycle.period;
    revalidatePath(`/p/${projectId}`, "layout");
  }, "Calendario preparado");
  if (result?.ok && period) redirect(`/p/${projectId}/ciclos/${period}#calendario-ia`);
  return result;
}

export async function generateCalendarPlanAction(projectId: string, cycleId: string, _: ActionState, formData: FormData) {
  return runAction(async () => {
    const ctx = await projectContextForAction(projectId, "ai.generate");
    await generateCalendarPlan(ctx, { cycleId, instructions: formString(formData, "instructions") });
    revalidatePath(`/p/${projectId}`, "layout");
  }, "Propuesta de calendario lista: revísala abajo");
}

/** Guarda la respuesta pegada desde un chat de Claude como propuesta de calendario. */
export async function importCalendarPlanAction(projectId: string, cycleId: string, _: ActionState, formData: FormData) {
  return runAction(async () => {
    const ctx = await projectContextForAction(projectId, "ai.generate");
    await importCalendarPlan(ctx, { cycleId, output: formString(formData, "output") });
    revalidatePath(`/p/${projectId}`, "layout");
  }, "Propuesta guardada: revísala abajo");
}

/** Crea las piezas marcadas, con el título, la fecha y la idea que la persona haya dejado. */
export async function applyCalendarPlanAction(projectId: string, generationId: string, _: ActionState, formData: FormData) {
  return runAction(async () => {
    const ctx = await projectContextForAction(projectId, "content.write");
    const entries = formData.getAll("pick").map((value) => {
      const index = Number(value);
      return {
        index,
        title: formString(formData, `title-${index}`),
        plannedAt: formString(formData, `plannedAt-${index}`),
        idea: formString(formData, `idea-${index}`),
      };
    });
    await applyCalendarPlan(ctx, { generationId, entries });
    revalidatePath(`/p/${projectId}`, "layout");
  }, "Piezas añadidas al calendario");
}

export async function generateInterpretationAction(
  projectId: string,
  cycleId: string,
  _: ActionState,
  formData: FormData,
) {
  return runAction(async () => {
    const ctx = await projectContextForAction(projectId, "ai.generate");
    await generateReportInterpretation(ctx, { cycleId, instructions: formString(formData, "instructions") });
    revalidatePath(`/p/${projectId}`, "layout");
  }, "Interpretación generada: revísala abajo");
}

export async function applyInterpretationAction(
  projectId: string,
  generationId: string,
  _: ActionState,
  formData: FormData,
) {
  return runAction(async () => {
    const ctx = await projectContextForAction(projectId, "report.write");
    await applyReportInterpretation(ctx, {
      generationId,
      title: formString(formData, "title"),
      body: formString(formData, "body"),
    });
    revalidatePath(`/p/${projectId}`, "layout");
  }, "Añadida al informe; falta revisarla");
}

export async function resolveGenerationAction(projectId: string, generationId: string, status: "used" | "discarded") {
  return runAction(async () => {
    const ctx = await projectContextForAction(projectId, "ai.generate");
    await resolveGeneration(ctx, { generationId, status });
    revalidatePath(`/p/${projectId}`, "layout");
  }, status === "used" ? "Marcada como aprovechada" : "Descartada");
}
