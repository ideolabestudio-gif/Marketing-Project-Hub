import { describe, expect, it } from "vitest";
import { ForbiddenError, ValidationError } from "@/lib/errors";
import { requireProjectAccess } from "@/modules/access/context";
import { getItemMetrics, getMetricSummary, recordItemMetricValue } from "@/modules/metrics/service";
import { seedTwoProjects } from "../fixtures/two-projects";

describe("métricas por publicación", () => {
  it("se registran en la pieza, se corrigen con motivo y no se mezclan con las del canal", async () => {
    const fx = await seedTwoProjects();
    const ana = await requireProjectAccess(fx.actors.ana, fx.projectA.id);
    const itemId = fx.reviewA.scheduled.item.id;
    const { values, definitions } = await getItemMetrics(ana, itemId);
    expect(definitions.every((d) => d.kind === "social")).toBe(true);
    const reach = values.filter((v) => v.metricKey === "social.reach");
    expect(reach.map((v) => [v.value, v.isCurrent])).toEqual(
      expect.arrayContaining([
        [350, true],
        [345, false],
      ]),
    );
    await expect(
      recordItemMetricValue(ana, { itemId, metricKey: "social.reach", value: "400" }),
    ).rejects.toBeInstanceOf(ValidationError);

    // El alcance del canal en el mes no cambia por el de la publicación.
    const summary = await getMetricSummary(ana, { cycleId: fx.contentA.cycle.id, channelId: fx.channelA.id });
    expect(summary[0].rows.find((r) => r.definition.key === "social.reach")?.value).toBeNull();
  });

  it("un editor puede registrarlas; un revisor no", async () => {
    const fx = await seedTwoProjects();
    const edu = await requireProjectAccess(fx.actors.edu, fx.projectA.id);
    const rev = await requireProjectAccess(fx.actors.rev, fx.projectA.id);
    const itemId = fx.reviewA.scheduled.item.id;
    await recordItemMetricValue(edu, { itemId, metricKey: "social.interactions", value: "1.234" });
    expect((await getItemMetrics(edu, itemId)).values.find((v) => v.metricKey === "social.interactions")?.value).toBe(1234);
    await expect(
      recordItemMetricValue(rev, { itemId, metricKey: "social.interactions", value: "1" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
