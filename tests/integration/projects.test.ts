import { beforeEach, describe, expect, it } from "vitest";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { requireProjectAccess } from "@/modules/access/context";
import { adminSetMembership } from "@/modules/access/service";
import {
  adminCreateClient,
  adminCreateProject,
  createChannel,
  getProject,
  listChannels,
  updateProjectSettings,
} from "@/modules/projects/service";
import { seedTwoProjects, type Fixture } from "../fixtures/two-projects";

describe("clientes, proyectos y canales", () => {
  let fx: Fixture;
  beforeEach(async () => {
    fx = await seedTwoProjects();
  });

  it("el admin crea cliente y proyecto, se asigna y el proyecto aparece con su zona horaria", async () => {
    const client = await adminCreateClient(fx.actors.admin, { name: "Cliente Gamma" });
    const project = await adminCreateProject(fx.actors.admin, {
      clientId: client.id,
      name: "Gamma",
      slug: "gamma",
      timezone: "Atlantic/Canary",
    });
    await adminSetMembership(fx.actors.admin, { projectId: project.id, userId: fx.users.admin.id, role: "manager" });
    const ctx = await requireProjectAccess(fx.actors.admin, project.id, "project.settings");
    expect(await getProject(ctx)).toMatchObject({ name: "Gamma", timezone: "Atlantic/Canary", clientName: "Cliente Gamma" });
  });

  it("valida nombres duplicados, slugs, zonas horarias y clientes inexistentes", async () => {
    await expect(adminCreateClient(fx.actors.admin, { name: fx.clientA.name })).rejects.toBeInstanceOf(ConflictError);
    await expect(
      adminCreateProject(fx.actors.admin, { clientId: fx.clientA.id, name: "X", slug: "alfa" }),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(
      adminCreateProject(fx.actors.admin, { clientId: fx.clientA.id, name: "X", slug: "Con Espacios" }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      adminCreateProject(fx.actors.admin, { clientId: fx.clientA.id, name: "X", slug: "x", timezone: "Marte/Olympus" }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      adminCreateProject(fx.actors.admin, {
        clientId: "00000000-0000-4000-8000-000000000000",
        name: "X",
        slug: "x",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("el manager crea canales en modo manual dentro de su proyecto", async () => {
    const ctx = await requireProjectAccess(fx.actors.ana, fx.projectA.id);
    const channel = await createChannel(ctx, { platform: "newsletter", displayName: "Newsletter", handle: "Lista general" });
    expect(channel).toMatchObject({ projectId: fx.projectA.id, kind: "email", mode: "manual" });
    expect((await listChannels(ctx)).map((c) => c.id)).toContain(channel.id);
    await expect(
      createChannel(ctx, { platform: "myspace" as never, displayName: "X" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("actualiza los ajustes del proyecto", async () => {
    const ctx = await requireProjectAccess(fx.actors.ana, fx.projectA.id);
    await updateProjectSettings(ctx, {
      timezone: "America/Mexico_City",
      locale: "es-MX",
      requireClientApproval: false,
      separationOfDuties: true,
    });
    expect(await getProject(ctx)).toMatchObject({
      timezone: "America/Mexico_City",
      locale: "es-MX",
      requireClientApproval: false,
    });
  });
});
