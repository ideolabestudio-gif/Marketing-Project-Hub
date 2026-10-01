"use server";

import { revalidatePath } from "next/cache";
import { formString, runAction, type ActionState } from "@/lib/action-state";
import { adminRemoveMembership, adminSetMembership } from "@/modules/access/service";
import { requireAdminActor } from "@/modules/identity/next";
import { adminInviteUser, adminSetUserActive } from "@/modules/identity/service";
import { adminCreateClient, adminCreateProject, adminSetProjectStatus } from "@/modules/projects/service";

export async function createClientAction(_: ActionState, formData: FormData) {
  return runAction(async () => {
    const actor = await requireAdminActor();
    await adminCreateClient(actor, { name: formString(formData, "name") });
    revalidatePath("/admin");
  }, "Cliente creado");
}

export async function createProjectAction(_: ActionState, formData: FormData) {
  return runAction(async () => {
    const actor = await requireAdminActor();
    await adminCreateProject(actor, {
      clientId: formString(formData, "clientId"),
      name: formString(formData, "name"),
      slug: formString(formData, "slug"),
      timezone: formString(formData, "timezone") || undefined,
    });
    revalidatePath("/admin");
  }, "Proyecto creado");
}

export async function setProjectStatusAction(projectId: string, status: "active" | "archived") {
  return runAction(async () => {
    const actor = await requireAdminActor();
    await adminSetProjectStatus(actor, { projectId, status });
    revalidatePath("/admin", "layout");
  }, status === "archived" ? "Proyecto archivado" : "Proyecto reactivado");
}

export async function inviteUserAction(_: ActionState, formData: FormData) {
  return runAction(async () => {
    const actor = await requireAdminActor();
    await adminInviteUser(actor, {
      email: formString(formData, "email"),
      name: formString(formData, "name"),
      isAdmin: formData.get("isAdmin") === "on",
    });
    revalidatePath("/admin/usuarios");
  }, "Usuario dado de alta");
}

export async function setUserActiveAction(userId: string, active: boolean) {
  return runAction(async () => {
    const actor = await requireAdminActor();
    await adminSetUserActive(actor, { userId, active });
    revalidatePath("/admin/usuarios");
  }, active ? "Usuario activado" : "Usuario desactivado");
}

export async function setMembershipAction(projectId: string, _: ActionState, formData: FormData) {
  return runAction(async () => {
    const actor = await requireAdminActor();
    await adminSetMembership(actor, {
      projectId,
      userId: formString(formData, "userId"),
      role: formString(formData, "role") as never,
    });
    revalidatePath(`/admin/proyectos/${projectId}`);
  }, "Miembro guardado");
}

export async function removeMembershipAction(projectId: string, userId: string) {
  return runAction(async () => {
    const actor = await requireAdminActor();
    await adminRemoveMembership(actor, { projectId, userId });
    revalidatePath(`/admin/proyectos/${projectId}`);
  }, "Miembro retirado");
}
