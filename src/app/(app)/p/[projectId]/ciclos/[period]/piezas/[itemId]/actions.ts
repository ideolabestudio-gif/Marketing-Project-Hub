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
import {
  cancelPublication,
  decideInternal,
  markPublished,
  recordClientDecision,
  recordPublication,
  submitForReview,
} from "@/modules/review/service";

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

// --- Revisión y publicación (el Hub solo REGISTRA; nunca publica ni envía) ---

export async function submitForReviewAction(
  projectId: string,
  itemId: string,
  versionId: string,
  _: ActionState,
  formData: FormData,
) {
  return runAction(async () => {
    const ctx = await projectContextForAction(projectId, "content.write");
    await submitForReview(ctx, { itemId, versionId, comment: formString(formData, "comment") });
    revalidatePath(`/p/${projectId}`, "layout");
  }, "Enviada a revisión");
}

export async function decideInternalAction(
  projectId: string,
  itemId: string,
  versionId: string,
  _: ActionState,
  formData: FormData,
) {
  return runAction(async () => {
    const ctx = await projectContextForAction(projectId, "approval.internal");
    await decideInternal(ctx, {
      itemId,
      versionId,
      decision: formString(formData, "decision") as never,
      comment: formString(formData, "comment"),
    });
    revalidatePath(`/p/${projectId}`, "layout");
  }, "Decisión registrada");
}

export async function recordClientDecisionAction(
  projectId: string,
  itemId: string,
  versionId: string,
  _: ActionState,
  formData: FormData,
) {
  return runAction(async () => {
    const ctx = await projectContextForAction(projectId, "approval.client.record");
    await recordClientDecision(ctx, {
      itemId,
      versionId,
      decision: formString(formData, "decision") as never,
      approverName: formString(formData, "approverName"),
      evidence: formString(formData, "evidence"),
      comment: formString(formData, "comment"),
    });
    revalidatePath(`/p/${projectId}`, "layout");
  }, "Respuesta del cliente registrada");
}

export async function recordPublicationAction(
  projectId: string,
  itemId: string,
  versionId: string,
  _: ActionState,
  formData: FormData,
) {
  return runAction(async () => {
    const ctx = await projectContextForAction(projectId, "publish");
    await recordPublication(ctx, {
      itemId,
      versionId,
      status: formString(formData, "status") as never,
      at: formString(formData, "at"),
      externalUrl: formString(formData, "externalUrl"),
      externalId: formString(formData, "externalId"),
      note: formString(formData, "note"),
    });
    revalidatePath(`/p/${projectId}`, "layout");
  }, "Publicación registrada");
}

export async function markPublishedAction(projectId: string, publicationId: string, _: ActionState, formData: FormData) {
  return runAction(async () => {
    const ctx = await projectContextForAction(projectId, "publish");
    await markPublished(ctx, {
      publicationId,
      at: formString(formData, "at"),
      externalUrl: formString(formData, "externalUrl"),
      externalId: formString(formData, "externalId"),
    });
    revalidatePath(`/p/${projectId}`, "layout");
  }, "Marcada como publicada");
}

export async function cancelPublicationAction(
  projectId: string,
  publicationId: string,
  _: ActionState,
  formData: FormData,
) {
  return runAction(async () => {
    const ctx = await projectContextForAction(projectId, "publish");
    await cancelPublication(ctx, { publicationId, reason: formString(formData, "reason") });
    revalidatePath(`/p/${projectId}`, "layout");
  }, "Programación cancelada");
}
