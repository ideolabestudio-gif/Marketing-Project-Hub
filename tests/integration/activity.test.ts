import { beforeEach, describe, expect, it } from "vitest";
import { ForbiddenError } from "@/lib/errors";
import { requireProjectAccess } from "@/modules/access/context";
import { listProjectActivity } from "@/modules/activity/service";
import { adminSetProjectStatus } from "@/modules/projects/service";
import { MARKER_A, MARKER_B, seedTwoProjects, type Fixture } from "../fixtures/two-projects";

let fx: Fixture;
beforeEach(async () => {
  fx = await seedTwoProjects();
});

describe("actividad del proyecto", () => {
  it("lista lo que ha pasado en el proyecto, con la pieza y su mes, sin nada de B", async () => {
    const ana = await requireProjectAccess(fx.actors.ana, fx.projectA.id);
    const { events } = await listProjectActivity(ana, {});
    const client = events.find((e) => e.action === "review.client_approved");
    expect(client?.itemTitle).toBe(`Programada ${MARKER_A}`);
    expect(client?.period).toBe(fx.contentA.cycle.period);
    expect(client?.actorName).toBe("Ana");
    expect(JSON.stringify(events)).not.toContain(MARKER_B);
    // Del más reciente al más antiguo.
    const times = events.map((e) => e.createdAt.getTime());
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  it("filtra por tipo y pagina con el cursor", async () => {
    const ana = await requireProjectAccess(fx.actors.ana, fx.projectA.id);
    const review = await listProjectActivity(ana, { group: "revision" });
    expect(review.events.length).toBeGreaterThan(0);
    expect(review.events.every((e) => e.action.startsWith("review."))).toBe(true);

    const all = await listProjectActivity(ana, {});
    const second = all.events[1];
    const older = await listProjectActivity(ana, { before: `${all.events[0].createdAt.toISOString()}_${all.events[0].id}` });
    expect(older.events[0].id).toBe(second.id);
    // «Todo» no incluye los accesos denegados; están en su filtro.
    expect(all.events.some((e) => e.action === "access.denied")).toBe(false);
    // Un tipo o un cursor que no existen se ignoran.
    expect((await listProjectActivity(ana, { group: "nada", before: "basura" })).events.length).toBe(all.events.length);
  });

  it("solo la responsable, y también con el proyecto archivado", async () => {
    const edu = await requireProjectAccess(fx.actors.edu, fx.projectA.id);
    await expect(listProjectActivity(edu, {})).rejects.toBeInstanceOf(ForbiddenError);
    await adminSetProjectStatus(fx.actors.admin, { projectId: fx.projectA.id, status: "archived" });
    const ana = await requireProjectAccess(fx.actors.ana, fx.projectA.id, "project.activity");
    const { events } = await listProjectActivity(ana, { group: "proyecto" });
    expect(events[0].action).toBe("project.archived");
  });
});
