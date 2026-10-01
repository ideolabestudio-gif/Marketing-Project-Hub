import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { clients, projectMemberships, projects, users } from "@/lib/db/schema";
import type { Role } from "./permissions";

// Nota: este repositorio LEE projects/clients/users mediante JOIN para listar.
// Solo ESCRIBE en project_memberships, que es su tabla.

export async function findMembership(userId: string, projectId: string) {
  const [row] = await getDb()
    .select({ role: projectMemberships.role, projectStatus: projects.status })
    .from(projectMemberships)
    .innerJoin(projects, eq(projects.id, projectMemberships.projectId))
    .where(and(eq(projectMemberships.userId, userId), eq(projectMemberships.projectId, projectId)))
    .limit(1);
  return row;
}

export async function listProjectsForUser(userId: string) {
  return getDb()
    .select({
      projectId: projects.id,
      projectName: projects.name,
      projectStatus: projects.status,
      clientName: clients.name,
      role: projectMemberships.role,
    })
    .from(projectMemberships)
    .innerJoin(projects, eq(projects.id, projectMemberships.projectId))
    .innerJoin(clients, eq(clients.id, projects.clientId))
    .where(eq(projectMemberships.userId, userId))
    .orderBy(asc(clients.name), asc(projects.name));
}

export async function listMembers(projectId: string) {
  return getDb()
    .select({
      userId: users.id,
      email: users.email,
      name: users.name,
      isActive: users.isActive,
      role: projectMemberships.role,
    })
    .from(projectMemberships)
    .innerJoin(users, eq(users.id, projectMemberships.userId))
    .where(eq(projectMemberships.projectId, projectId))
    .orderBy(asc(users.email));
}

export async function upsertMembership(values: {
  projectId: string;
  userId: string;
  role: Role;
  createdBy: string;
}): Promise<void> {
  await getDb()
    .insert(projectMemberships)
    .values(values)
    .onConflictDoUpdate({
      target: [projectMemberships.projectId, projectMemberships.userId],
      set: { role: values.role },
    });
}

export async function deleteMembership(projectId: string, userId: string): Promise<boolean> {
  const rows = await getDb()
    .delete(projectMemberships)
    .where(and(eq(projectMemberships.projectId, projectId), eq(projectMemberships.userId, userId)))
    .returning({ userId: projectMemberships.userId });
  return rows.length > 0;
}

export async function projectExists(projectId: string): Promise<boolean> {
  const [row] = await getDb().select({ id: projects.id }).from(projects).where(eq(projects.id, projectId)).limit(1);
  return Boolean(row);
}

export async function userExists(userId: string): Promise<boolean> {
  const [row] = await getDb().select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
  return Boolean(row);
}
