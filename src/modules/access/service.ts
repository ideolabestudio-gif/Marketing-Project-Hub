import { z } from "zod";
import { NotFoundError } from "@/lib/errors";
import { isUuid, parseInput } from "@/lib/validation";
import { recordAudit } from "@/modules/audit/service";
import { assertAdmin, type Actor } from "@/modules/identity/actor";
import { authorize, type ProjectContext } from "./context";
import { ROLES } from "./permissions";
import {
  deleteMembership,
  listMembers,
  listProjectsForUser,
  projectExists,
  upsertMembership,
  userExists,
} from "./repo";

/** Proyectos en los que el actor es miembro. Es la única forma de listar proyectos fuera de /admin. */
export async function listMyProjects(actor: Actor) {
  return listProjectsForUser(actor.userId);
}

export async function listProjectMembers(ctx: ProjectContext) {
  await authorize(ctx, "project.read");
  return listMembers(ctx.projectId);
}

export async function adminListProjectMembers(actor: Actor, projectId: string) {
  assertAdmin(actor);
  if (!isUuid(projectId) || !(await projectExists(projectId))) throw new NotFoundError();
  return listMembers(projectId);
}

const membershipSchema = z.object({
  projectId: z.uuid(),
  userId: z.uuid("Selecciona un usuario"),
  role: z.enum(ROLES, "Rol no válido"),
});

export async function adminSetMembership(actor: Actor, input: z.input<typeof membershipSchema>): Promise<void> {
  assertAdmin(actor);
  const data = parseInput(membershipSchema, input);
  if (!(await projectExists(data.projectId)) || !(await userExists(data.userId))) throw new NotFoundError();
  await upsertMembership({ ...data, createdBy: actor.userId });
  await recordAudit({
    action: "membership.set",
    actorId: actor.userId,
    projectId: data.projectId,
    entityType: "user",
    entityId: data.userId,
    data: { role: data.role },
  });
}

export async function adminRemoveMembership(
  actor: Actor,
  input: { projectId: string; userId: string },
): Promise<void> {
  assertAdmin(actor);
  if (!isUuid(input.projectId) || !isUuid(input.userId)) throw new NotFoundError();
  const removed = await deleteMembership(input.projectId, input.userId);
  if (!removed) throw new NotFoundError();
  await recordAudit({
    action: "membership.removed",
    actorId: actor.userId,
    projectId: input.projectId,
    entityType: "user",
    entityId: input.userId,
  });
}
