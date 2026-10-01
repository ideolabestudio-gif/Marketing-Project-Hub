"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { formString, runAction, type ActionState } from "@/lib/action-state";
import { projectContextForAction } from "@/lib/project-page";
import { createItem } from "@/modules/content/service";
import { setCycleStatus, updateCycleBrief } from "@/modules/cycles/service";

export async function updateBriefAction(projectId: string, cycleId: string, _: ActionState, formData: FormData) {
  return runAction(async () => {
    const ctx = await projectContextForAction(projectId, "cycle.manage");
    await updateCycleBrief(ctx, {
      cycleId,
      objectives: formString(formData, "objectives"),
      keyDates: formString(formData, "keyDates"),
      notes: formString(formData, "notes"),
    });
    revalidatePath(`/p/${projectId}`, "layout");
  });
}

export async function setStatusAction(projectId: string, cycleId: string, _: ActionState, formData: FormData) {
  return runAction(async () => {
    const ctx = await projectContextForAction(projectId, "cycle.manage");
    await setCycleStatus(ctx, { cycleId, status: formString(formData, "status") as never });
    revalidatePath(`/p/${projectId}`, "layout");
  }, "Estado actualizado");
}

export async function createItemAction(
  projectId: string,
  cycleId: string,
  period: string,
  _: ActionState,
  formData: FormData,
) {
  let itemId: string | undefined;
  const result = await runAction(async () => {
    const ctx = await projectContextForAction(projectId, "content.write");
    const [channelId, format] = formString(formData, "channelFormat").split("|");
    itemId = (
      await createItem(ctx, {
        cycleId,
        channelId: channelId ?? "",
        format: format ?? "",
        title: formString(formData, "title"),
        plannedAt: formString(formData, "plannedAt"),
      })
    ).id;
    revalidatePath(`/p/${projectId}`, "layout");
  }, "Pieza creada");
  if (result?.ok && itemId) redirect(`/p/${projectId}/ciclos/${period}/piezas/${itemId}`);
  return result;
}
