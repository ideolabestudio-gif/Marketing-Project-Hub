"use server";

import { revalidatePath } from "next/cache";
import { formString, runAction, type ActionState } from "@/lib/action-state";
import { projectContextForAction } from "@/lib/project-page";
import { createChannel, setChannelActive, updateProjectSettings } from "@/modules/projects/service";

// El projectId llega ligado con .bind() desde la página. Como cualquier dato del
// cliente puede manipularse, la seguridad no depende de su origen: siempre se
// autoriza con requireProjectAccess y los recursos se buscan dentro del proyecto.

export async function updateSettingsAction(projectId: string, _: ActionState, formData: FormData) {
  return runAction(async () => {
    const ctx = await projectContextForAction(projectId, "project.settings");
    await updateProjectSettings(ctx, {
      timezone: formString(formData, "timezone"),
      locale: formString(formData, "locale"),
    });
    revalidatePath(`/p/${projectId}`, "layout");
  });
}

export async function createChannelAction(projectId: string, _: ActionState, formData: FormData) {
  return runAction(async () => {
    const ctx = await projectContextForAction(projectId, "project.settings");
    await createChannel(ctx, {
      platform: formString(formData, "platform") as never,
      displayName: formString(formData, "displayName"),
      handle: formString(formData, "handle"),
    });
    revalidatePath(`/p/${projectId}`, "layout");
  }, "Canal creado");
}

export async function setChannelActiveAction(
  projectId: string,
  channelId: string,
  active: boolean,
) {
  return runAction(async () => {
    const ctx = await projectContextForAction(projectId, "project.settings");
    await setChannelActive(ctx, { channelId, active });
    revalidatePath(`/p/${projectId}`, "layout");
  }, active ? "Canal activado" : "Canal desactivado");
}
