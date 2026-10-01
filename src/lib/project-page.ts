import { notFound } from "next/navigation";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { requireProjectAccess, type ProjectContext } from "@/modules/access/context";
import type { Permission } from "@/modules/access/permissions";
import { requireActor } from "@/modules/identity/next";

/**
 * Punto de entrada obligatorio de toda página bajo /p/[projectId]: exige sesión y
 * membresía. Sin acceso responde 404 (no se revela si el proyecto existe).
 */
export async function projectContextForPage(
  projectId: string,
  permission: Permission = "project.read",
): Promise<ProjectContext> {
  const actor = await requireActor();
  try {
    return await requireProjectAccess(actor, projectId, permission);
  } catch (err) {
    if (err instanceof NotFoundError || err instanceof ForbiddenError) notFound();
    throw err;
  }
}

/** Igual que la anterior, para acciones de servidor (devuelven errores en vez de 404). */
export async function projectContextForAction(
  projectId: string,
  permission: Permission = "project.read",
): Promise<ProjectContext> {
  const actor = await requireActor();
  return requireProjectAccess(actor, projectId, permission);
}
