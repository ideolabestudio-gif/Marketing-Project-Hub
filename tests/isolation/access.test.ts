import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/lib/db/client";
import { auditEvents, projectMemberships, projects } from "@/lib/db/schema";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { authorize, requireProjectAccess } from "@/modules/access/context";
import { can, PERMISSIONS, ROLE_PERMISSIONS, ROLES, type Permission, type Role } from "@/modules/access/permissions";
import { createChannel } from "@/modules/projects/service";
import { seedTwoProjects, type Fixture } from "../fixtures/two-projects";

/** Copia literal de la matriz de docs/05-autenticacion-autorizacion.md (HT-03). */
const DOCUMENTED_MATRIX: Record<Permission, Role[]> = {
  "project.read": ["manager", "editor", "reviewer", "viewer"],
  "project.settings": ["manager"],
  "cycle.manage": ["manager"],
  "content.write": ["manager", "editor"],
  "ai.generate": ["manager", "editor"],
  "approval.internal": ["manager", "reviewer"],
  "approval.client.record": ["manager"],
  publish: ["manager", "editor"],
  "metrics.write": ["manager", "editor"],
  "report.write": ["manager", "editor"],
  "report.approve": ["manager", "reviewer"],
  "integration.manage": ["manager"],
  "comment.write": ["manager", "editor", "reviewer"],
};

async function deniedEvents(actorId: string) {
  return getDb()
    .select()
    .from(auditEvents)
    .where(and(eq(auditEvents.actorId, actorId), eq(auditEvents.action, "access.denied")));
}

describe("matriz de permisos (HT-03)", () => {
  it("permissions.ts coincide con la matriz documentada", () => {
    for (const permission of PERMISSIONS) {
      const allowed = ROLES.filter((r) => can(r, permission));
      expect(allowed, permission).toEqual(DOCUMENTED_MATRIX[permission]);
    }
    expect(Object.keys(DOCUMENTED_MATRIX).sort()).toEqual([...PERMISSIONS].sort());
  });

  it("todos los roles tienen al menos project.read", () => {
    for (const role of ROLES) expect(ROLE_PERMISSIONS[role]).toContain("project.read");
  });
});

describe("requireProjectAccess", () => {
  let fx: Fixture;
  beforeEach(async () => {
    fx = await seedTwoProjects();
  });

  it("aplica la matriz rol × permiso contra la base de datos", async () => {
    const byRole: Record<Role, Fixture["actors"][keyof Fixture["actors"]]> = {
      manager: fx.actors.ana,
      editor: fx.actors.edu,
      reviewer: fx.actors.rev,
      viewer: fx.actors.mix,
    };
    for (const role of ROLES) {
      for (const permission of PERMISSIONS) {
        const attempt = requireProjectAccess(byRole[role], fx.projectA.id, permission);
        if (can(role, permission)) await expect(attempt).resolves.toMatchObject({ role });
        else await expect(attempt).rejects.toBeInstanceOf(ForbiddenError);
      }
    }
  });

  it("un no miembro recibe NotFound y queda auditado (HT-01/HT-05)", async () => {
    await expect(requireProjectAccess(fx.actors.ana, fx.projectB.id)).rejects.toBeInstanceOf(NotFoundError);
    const events = await deniedEvents(fx.users.ana.id);
    expect(events).toHaveLength(1);
    expect(events[0].projectId).toBe(fx.projectB.id);
    expect(events[0].data).toMatchObject({ reason: "not_member" });
  });

  it("un proyecto inexistente o un ID mal formado da NotFound", async () => {
    await expect(
      requireProjectAccess(fx.actors.ana, "00000000-0000-4000-8000-000000000000"),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(requireProjectAccess(fx.actors.ana, "' OR 1=1 --")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("los administradores no tienen acceso implícito a los proyectos", async () => {
    await expect(requireProjectAccess(fx.actors.admin, fx.projectA.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("ser editor en B no da permisos de escritura en A (SV-05)", async () => {
    await expect(requireProjectAccess(fx.actors.mix, fx.projectA.id, "project.settings")).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    const ctxA = await requireProjectAccess(fx.actors.mix, fx.projectA.id);
    expect(ctxA.role).toBe("viewer");
    await expect(createChannel(ctxA, { platform: "x", displayName: "X" })).rejects.toBeInstanceOf(ForbiddenError);
    const ctxB = await requireProjectAccess(fx.actors.mix, fx.projectB.id);
    expect(ctxB.role).toBe("editor");
  });

  it("retirar la membresía corta el acceso inmediatamente (SV-06)", async () => {
    await expect(requireProjectAccess(fx.actors.edu, fx.projectA.id)).resolves.toBeDefined();
    await getDb()
      .delete(projectMemberships)
      .where(and(eq(projectMemberships.projectId, fx.projectA.id), eq(projectMemberships.userId, fx.users.edu.id)));
    await expect(requireProjectAccess(fx.actors.edu, fx.projectA.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("un proyecto archivado solo admite lectura", async () => {
    await getDb().update(projects).set({ status: "archived" }).where(eq(projects.id, fx.projectA.id));
    const ctx = await requireProjectAccess(fx.actors.ana, fx.projectA.id);
    expect(ctx.projectArchived).toBe(true);
    await expect(authorize(ctx, "project.settings")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(requireProjectAccess(fx.actors.ana, fx.projectA.id, "content.write")).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});
