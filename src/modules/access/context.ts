import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { isUuid } from "@/lib/validation";
import { recordAudit } from "@/modules/audit/service";
import type { Actor } from "@/modules/identity/actor";
import { can, READ_ONLY_PERMISSIONS, type Permission, type Role } from "./permissions";
import { findMembership } from "./repo";

declare const projectContextBrand: unique symbol;

/**
 * Contexto de proyecto autorizado. Solo `requireProjectAccess` puede crearlo, así que
 * tener uno demuestra que el actor es miembro del proyecto. Todas las funciones de
 * servicio con datos de cliente lo exigen como primer argumento.
 */
export type ProjectContext = Readonly<{
  projectId: string;
  actor: Actor;
  role: Role;
  projectArchived: boolean;
}> & { readonly [projectContextBrand]: true };

/**
 * Comprueba que el actor es miembro del proyecto y tiene el permiso indicado.
 * - Sin membresía (o proyecto inexistente) ⇒ NotFoundError (no se revela que existe).
 * - Con membresía pero sin permiso ⇒ ForbiddenError.
 * Ambos casos se auditan como `access.denied`.
 * Los administradores NO tienen acceso implícito: para ver datos de un proyecto
 * necesitan ser miembros (mínimo privilegio).
 */
export async function requireProjectAccess(
  actor: Actor,
  projectId: string,
  permission: Permission = "project.read",
): Promise<ProjectContext> {
  const membership = isUuid(projectId) ? await findMembership(actor.userId, projectId) : undefined;
  if (!membership) {
    await auditDenied(actor, projectId, permission, "not_member");
    throw new NotFoundError();
  }
  const ctx = Object.freeze({
    projectId,
    actor,
    role: membership.role,
    projectArchived: membership.projectStatus === "archived",
  }) as ProjectContext;
  await authorize(ctx, permission);
  return ctx;
}

/** Comprueba un permiso adicional sobre un contexto ya obtenido. */
export async function authorize(ctx: ProjectContext, permission: Permission): Promise<void> {
  if (!can(ctx.role, permission)) {
    await auditDenied(ctx.actor, ctx.projectId, permission, "missing_permission");
    throw new ForbiddenError();
  }
  if (ctx.projectArchived && !READ_ONLY_PERMISSIONS.includes(permission)) {
    await auditDenied(ctx.actor, ctx.projectId, permission, "project_archived");
    throw new ForbiddenError("El proyecto está archivado (solo lectura)");
  }
}

export function hasPermission(ctx: ProjectContext, permission: Permission): boolean {
  if (ctx.projectArchived && !READ_ONLY_PERMISSIONS.includes(permission)) return false;
  return can(ctx.role, permission);
}

async function auditDenied(actor: Actor, projectId: string, permission: Permission, reason: string) {
  await recordAudit({
    action: "access.denied",
    actorId: actor.userId,
    projectId: isUuid(projectId) ? projectId : null,
    data: { permission, reason, ...(isUuid(projectId) ? {} : { rawProjectId: String(projectId).slice(0, 100) }) },
  });
}
