"use server";

import { revalidatePath } from "next/cache";
import { formString, runAction, type ActionState } from "@/lib/action-state";
import { projectContextForAction } from "@/lib/project-page";
import {
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
