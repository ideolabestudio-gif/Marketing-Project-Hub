"use server";

import { revalidatePath } from "next/cache";
import { ValidationError } from "@/lib/errors";
import { formString, runAction, type ActionState } from "@/lib/action-state";
import { projectContextForAction } from "@/lib/project-page";
import { BRAND_FIELDS, saveBrandProfile } from "@/modules/brand/service";
import { addLibraryFile, addLibraryLink, removeLibraryItem } from "@/modules/content/service";

// projectId y libraryItemId llegan ligados con .bind(): se tratan como no fiables; los
// servicios autorizan y buscan el material dentro del proyecto autorizado.

export async function saveBrandProfileAction(projectId: string, _: ActionState, formData: FormData) {
  return runAction(async () => {
    const ctx = await projectContextForAction(projectId, "project.settings");
    await saveBrandProfile(ctx, Object.fromEntries(BRAND_FIELDS.map((f) => [f.key, formString(formData, f.key)])));
    revalidatePath(`/p/${projectId}`, "layout");
  }, "Ficha guardada (nueva versión)");
}

function libraryFields(formData: FormData) {
  return {
    category: formString(formData, "category") as never,
    title: formString(formData, "title"),
    description: formString(formData, "description"),
  };
}

export async function addLibraryFileAction(projectId: string, _: ActionState, formData: FormData) {
  return runAction(async () => {
    const ctx = await projectContextForAction(projectId, "content.write");
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) throw new ValidationError("Elige un archivo");
    await addLibraryFile(ctx, {
      ...libraryFields(formData),
      filename: file.name,
      bytes: new Uint8Array(await file.arrayBuffer()),
    });
    revalidatePath(`/p/${projectId}`, "layout");
  }, "Material añadido a la biblioteca");
}

export async function addLibraryLinkAction(projectId: string, _: ActionState, formData: FormData) {
  return runAction(async () => {
    const ctx = await projectContextForAction(projectId, "content.write");
    await addLibraryLink(ctx, { ...libraryFields(formData), url: formString(formData, "url") });
    revalidatePath(`/p/${projectId}`, "layout");
  }, "Enlace añadido a la biblioteca");
}

export async function removeLibraryItemAction(projectId: string, libraryItemId: string) {
  return runAction(async () => {
    const ctx = await projectContextForAction(projectId, "content.write");
    await removeLibraryItem(ctx, { libraryItemId });
    revalidatePath(`/p/${projectId}`, "layout");
  }, "Quitado de la biblioteca");
}
