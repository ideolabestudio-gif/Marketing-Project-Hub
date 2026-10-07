"use server";

import { revalidatePath } from "next/cache";
import { formString, runAction, type ActionState } from "@/lib/action-state";
import { projectContextForAction } from "@/lib/project-page";
import {
  addReportSection,
  approveReport,
  createReport,
  deleteReportSection,
  markAiSectionReviewed,
  moveReportSection,
  reopenReport,
  updateReportSection,
} from "@/modules/reports/service";

function sectionFields(formData: FormData) {
  return {
    title: formString(formData, "title"),
    body: formString(formData, "body"),
    channelId: formString(formData, "channelId") || undefined,
    comparePrevious: formData.get("comparePrevious") === "on",
  };
}

export async function createReportAction(projectId: string, cycleId: string) {
  return runAction(async () => {
    const ctx = await projectContextForAction(projectId, "report.write");
    await createReport(ctx, { cycleId });
    revalidatePath(`/p/${projectId}`, "layout");
  }, "Informe creado");
}

export async function addSectionAction(projectId: string, reportId: string, _: ActionState, formData: FormData) {
  return runAction(async () => {
    const ctx = await projectContextForAction(projectId, "report.write");
    await addReportSection(ctx, {
      reportId,
      kind: formString(formData, "kind") as "data" | "publications" | "human_analysis",
      ...sectionFields(formData),
    });
    revalidatePath(`/p/${projectId}`, "layout");
  }, "Sección añadida");
}

export async function updateSectionAction(projectId: string, sectionId: string, _: ActionState, formData: FormData) {
  return runAction(async () => {
    const ctx = await projectContextForAction(projectId, "report.write");
    await updateReportSection(ctx, { sectionId, ...sectionFields(formData) });
    revalidatePath(`/p/${projectId}`, "layout");
  }, "Sección guardada");
}

export async function deleteSectionAction(projectId: string, sectionId: string) {
  return runAction(async () => {
    const ctx = await projectContextForAction(projectId, "report.write");
    await deleteReportSection(ctx, { sectionId });
    revalidatePath(`/p/${projectId}`, "layout");
  }, "Sección eliminada");
}

export async function moveSectionAction(projectId: string, sectionId: string, direction: "up" | "down") {
  return runAction(async () => {
    const ctx = await projectContextForAction(projectId, "report.write");
    await moveReportSection(ctx, { sectionId, direction });
    revalidatePath(`/p/${projectId}`, "layout");
  }, "Orden cambiado");
}

export async function approveReportAction(projectId: string, reportId: string) {
  return runAction(async () => {
    const ctx = await projectContextForAction(projectId, "report.approve");
    await approveReport(ctx, { reportId });
    revalidatePath(`/p/${projectId}`, "layout");
  }, "Informe aprobado");
}

export async function reopenReportAction(projectId: string, reportId: string, _: ActionState, formData: FormData) {
  return runAction(async () => {
    const ctx = await projectContextForAction(projectId, "report.approve");
    await reopenReport(ctx, { reportId, reason: formString(formData, "reason") });
    revalidatePath(`/p/${projectId}`, "layout");
  }, "Informe reabierto");
}

export async function markAiSectionReviewedAction(projectId: string, sectionId: string) {
  return runAction(async () => {
    const ctx = await projectContextForAction(projectId, "report.write");
    await markAiSectionReviewed(ctx, { sectionId });
    revalidatePath(`/p/${projectId}`, "layout");
  }, "Marcada como revisada");
}
