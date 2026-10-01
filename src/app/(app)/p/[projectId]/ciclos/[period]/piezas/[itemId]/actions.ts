"use server";

import { revalidatePath } from "next/cache";
import { formString, runAction, type ActionState } from "@/lib/action-state";
import { ValidationError } from "@/lib/errors";
import { projectContextForAction } from "@/lib/project-page";
import {
  addComment,
  addLinkAsset,
  removeAsset,
  saveVersion,
  setItemCancelled,
  updateItem,
  uploadAsset,
} from "@/modules/content/service";

// projectId e itemId llegan ligados con .bind(): se tratan como no fiables; los servicios
// autorizan y buscan la pieza dentro del proyecto autorizado.

export async function updateItemAction(projectId: string, itemId: string, _: ActionState, formData: FormData) {
  return runAction(async () => {
    const ctx = await projectContextForAction(projectId, "content.write");
    const [channelId, format] = formString(formData, "channelFormat").split("|");
    await updateItem(ctx, {
      itemId,
      channelId: channelId ?? "",
      format: format ?? "",
      title: formString(formData, "title"),
      plannedAt: formString(formData, "plannedAt"),
    });
    revalidatePath(`/p/${projectId}`, "layout");
  });
}

export async function setCancelledAction(projectId: string, itemId: string, cancelled: boolean) {
  return runAction(async () => {
    const ctx = await projectContextForAction(projectId, "content.write");
    await setItemCancelled(ctx, { itemId, cancelled });
    revalidatePath(`/p/${projectId}`, "layout");
  }, cancelled ? "Pieza cancelada" : "Pieza reactivada");
}

export async function saveVersionAction(projectId: string, itemId: string, _: ActionState, formData: FormData) {
  return runAction(async () => {
    const ctx = await projectContextForAction(projectId, "content.write");
    const version = await saveVersion(ctx, {
      itemId,
      body: formString(formData, "body"),
      emailSubject: formString(formData, "emailSubject"),
      emailPreheader: formString(formData, "emailPreheader"),
      linkUrl: formString(formData, "linkUrl"),
      note: formString(formData, "note"),
    });
    revalidatePath(`/p/${projectId}`, "layout");
    return version;
  }, "Versión guardada");
}

export async function uploadAssetAction(projectId: string, itemId: string, _: ActionState, formData: FormData) {
  return runAction(async () => {
    const ctx = await projectContextForAction(projectId, "content.write");
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) throw new ValidationError("Elige un archivo");
    await uploadAsset(ctx, { itemId, filename: file.name, bytes: new Uint8Array(await file.arrayBuffer()) });
    revalidatePath(`/p/${projectId}`, "layout");
  }, "Archivo añadido (nueva versión)");
}

export async function addLinkAction(projectId: string, itemId: string, _: ActionState, formData: FormData) {
  return runAction(async () => {
    const ctx = await projectContextForAction(projectId, "content.write");
    await addLinkAsset(ctx, { itemId, url: formString(formData, "url"), label: formString(formData, "label") });
    revalidatePath(`/p/${projectId}`, "layout");
  }, "Enlace añadido (nueva versión)");
}

export async function removeAssetAction(projectId: string, itemId: string, assetId: string) {
  return runAction(async () => {
    const ctx = await projectContextForAction(projectId, "content.write");
    await removeAsset(ctx, { itemId, assetId });
    revalidatePath(`/p/${projectId}`, "layout");
  }, "Quitado (nueva versión)");
}

export async function addCommentAction(projectId: string, itemId: string, _: ActionState, formData: FormData) {
  return runAction(async () => {
    const ctx = await projectContextForAction(projectId, "comment.write");
    await addComment(ctx, { itemId, body: formString(formData, "body") });
    revalidatePath(`/p/${projectId}`, "layout");
  }, "Comentario añadido");
}
