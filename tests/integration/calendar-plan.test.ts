import { eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/lib/db/client";
import { aiGenerations, contentItems } from "@/lib/db/schema";
import { ForbiddenError, ValidationError } from "@/lib/errors";
import { nextPeriod } from "@/lib/time";
import { requireProjectAccess, type ProjectContext } from "@/modules/access/context";
import {
  applyCalendarPlan,
  generateCalendarPlan,
  listGenerations,
  prepareNextMonthCalendar,
  resolveGeneration,
} from "@/modules/ai/service";
import { getItemDetail, listItems } from "@/modules/content/service";
import { getCycleByPeriod, listCycles, openCycle } from "@/modules/cycles/service";
import { updateAiSettings } from "@/modules/projects/service";
import { fakeAi, installFakeAi } from "../fixtures/fake-ai";
import { calendarPlanReply, FIXTURE_PERIOD, MARKER_A, MARKER_B, seedTwoProjects, type Fixture } from "../fixtures/two-projects";

let fx: Fixture;
let ctx: ProjectContext;

beforeEach(async () => {
  fakeAi.reset();
  fx = await seedTwoProjects();
  ctx = await requireProjectAccess(fx.actors.ana, fx.projectA.id);
  fakeAi.reset();
});
afterEach(() => installFakeAi());

async function itemsOf(projectId: string) {
  return getDb().execute(sql`SELECT * FROM content_items WHERE project_id = ${projectId} ORDER BY id`);
}

describe("propuesta de calendario", () => {
  it("pide salida estructurada con los canales activos y no crea piezas (AI-03)", async () => {
    const before = JSON.stringify(await itemsOf(fx.projectA.id));
    fakeAi.reply = calendarPlanReply(MARKER_A);
    await generateCalendarPlan(ctx, { cycleId: fx.contentA.cycle.id, instructions: "Tres reels" });
    expect(JSON.stringify(await itemsOf(fx.projectA.id))).toBe(before);

    const request = fakeAi.requests[0];
    expect(request.jsonSchema).toBeDefined();
    expect(JSON.stringify(request.jsonSchema)).toContain('"enum":["C1"]');
    expect(request.prompt).toContain(`C1 · IG ${MARKER_A}`);
    expect(request.prompt).toContain(`Pieza ${MARKER_A}`); // lo ya planificado
    expect(request.prompt).not.toContain(MARKER_B);
    expect(request.prompt).toMatch(/Indicaciones de la persona que lo pide:\nTres reels$/);
  });

  it("incluye el mes anterior: sus piezas y solo las métricas registradas", async () => {
    const november = await openCycle(ctx, { period: "2026-11" });
    await generateCalendarPlan(ctx, { cycleId: november.id });
    const prompt = fakeAi.requests[0].prompt;
    expect(prompt).toContain("Mes anterior (Octubre de 2026)");
    expect(prompt).toContain(`Pieza ${MARKER_A}`);
    expect(prompt).toMatch(/Seguidores: 1250/);
    expect(prompt).not.toMatch(/sin dato/);
  });

  it("muestra las propuestas válidas por fecha y cuenta las descartadas", async () => {
    const [generation] = await listGenerations(ctx, { cycleId: fx.contentA.cycle.id, purpose: "calendar_plan" });
    expect(generation.id).toBe(fx.aiA.calendarPlan.id);
    expect(generation.plan?.discarded).toBe(1);
    expect(generation.plan?.proposals.map((p) => [p.index, p.plannedAt, p.format, p.channelId])).toEqual([
      [1, `${FIXTURE_PERIOD}-12T10:00`, "post", fx.channelA.id],
      [0, `${FIXTURE_PERIOD}-20T18:30`, "reel", fx.channelA.id],
    ]);
  });

  it("si la respuesta no es JSON válido no hay propuestas, pero queda guardada", async () => {
    fakeAi.reply = "Esto no es JSON";
    const generation = await generateCalendarPlan(ctx, { cycleId: fx.contentA.cycle.id });
    const listed = (await listGenerations(ctx, { cycleId: fx.contentA.cycle.id, purpose: "calendar_plan" })).find(
      (g) => g.id === generation.id,
    );
    expect(listed?.plan).toEqual({ proposals: [], discarded: 0 });
    expect(listed?.output).toBe("Esto no es JSON");
  });
});

describe("añadir al calendario (acción humana)", () => {
  it("crea solo las piezas elegidas, como ideas enlazadas a la generación, con la idea como comentario", async () => {
    const before = (await listItems(ctx, fx.contentA.cycle.id)).length;
    const edu = await requireProjectAccess(fx.actors.edu, fx.projectA.id); // editor
    const [item] = await applyCalendarPlan(edu, {
      generationId: fx.aiA.calendarPlan.id,
      entries: [{ index: 0, title: "Reel ajustado", plannedAt: `${FIXTURE_PERIOD}-22T19:00`, idea: "Idea revisada" }],
    });
    expect(await listItems(ctx, fx.contentA.cycle.id)).toHaveLength(before + 1);
    expect(item).toMatchObject({
      title: "Reel ajustado",
      format: "reel",
      channelId: fx.channelA.id,
      status: "idea",
      aiGenerationId: fx.aiA.calendarPlan.id,
    });
    const detail = await getItemDetail(ctx, item.id);
    expect(detail.current).toBeFalsy(); // sin versiones ni aprobaciones
    expect(JSON.stringify(detail.comments)).toContain("Idea: Idea revisada");

    const [generation] = await getDb().select().from(aiGenerations).where(eq(aiGenerations.id, fx.aiA.calendarPlan.id));
    expect(generation.status).toBe("used");
    await expect(
      applyCalendarPlan(ctx, {
        generationId: fx.aiA.calendarPlan.id,
        entries: [{ index: 1, title: "Otra vez", plannedAt: `${FIXTURE_PERIOD}-12T10:00` }],
      }),
    ).rejects.toThrow(/ya se usó/);
  });

  it("no crea nada si alguna elección no es válida, y la propuesta sigue pendiente", async () => {
    const before = JSON.stringify(await itemsOf(fx.projectA.id));
    const cases = [
      [{ index: 2, title: "Descartada", plannedAt: `${FIXTURE_PERIOD}-12T10:00` }], // la de fuera del mes
      [{ index: 9, title: "No existe", plannedAt: `${FIXTURE_PERIOD}-12T10:00` }],
      [
        { index: 1, title: "Buena", plannedAt: `${FIXTURE_PERIOD}-12T10:00` },
        { index: 0, title: "Mala", plannedAt: "2026-11-02T10:00" },
      ],
      [],
    ];
    for (const entries of cases) {
      await expect(applyCalendarPlan(ctx, { generationId: fx.aiA.calendarPlan.id, entries })).rejects.toBeInstanceOf(
        ValidationError,
      );
    }
    expect(JSON.stringify(await itemsOf(fx.projectA.id))).toBe(before);
    const [generation] = await getDb().select().from(aiGenerations).where(eq(aiGenerations.id, fx.aiA.calendarPlan.id));
    expect(generation.status).toBe("draft");
  });

  it("quien no puede editar contenidos no la aplica; se descarta, pero no se marca «usada» sin crear piezas", async () => {
    const rev = await requireProjectAccess(fx.actors.rev, fx.projectA.id);
    await expect(
      applyCalendarPlan(rev, {
        generationId: fx.aiA.calendarPlan.id,
        entries: [{ index: 1, title: "Post", plannedAt: `${FIXTURE_PERIOD}-12T10:00` }],
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(resolveGeneration(ctx, { generationId: fx.aiA.calendarPlan.id, status: "used" })).rejects.toBeInstanceOf(
      ValidationError,
    );
    await resolveGeneration(ctx, { generationId: fx.aiA.calendarPlan.id, status: "discarded" });
  });

  it("en BD, una pieza solo puede apuntar a una generación de su mismo proyecto", async () => {
    const err = await getDb()
      .update(contentItems)
      .set({ aiGenerationId: fx.aiB.calendarPlan.id })
      .where(eq(contentItems.id, fx.contentA.item.id))
      .then(
        () => null,
        (e: { code?: string; cause?: { code?: string } }) => e,
      );
    expect(err?.cause?.code ?? err?.code).toBe("23503");
  });
});

describe("«prepara el calendario del mes que viene»", () => {
  it("abre el ciclo del mes siguiente si no existe y deja una propuesta pendiente", async () => {
    const period = nextPeriod(new Date(), "Europe/Madrid");
    fakeAi.reply = calendarPlanReply(MARKER_A, period);
    const { cycle, generation } = await prepareNextMonthCalendar(ctx, { instructions: "Campaña de invierno" });
    expect(cycle.period).toBe(period);
    expect((await getCycleByPeriod(ctx, period)).id).toBe(cycle.id);
    expect(generation).toMatchObject({ purpose: "calendar_plan", status: "draft", instructions: "Campaña de invierno" });
    const [listed] = await listGenerations(ctx, { cycleId: cycle.id, purpose: "calendar_plan" });
    expect(listed.plan?.proposals).toHaveLength(2);
    expect(await listItems(ctx, cycle.id)).toHaveLength(0);

    // Una segunda orden reutiliza el ciclo.
    const again = await prepareNextMonthCalendar(ctx, {});
    expect(again.cycle.id).toBe(cycle.id);
  });

  it("un editor no puede abrir el ciclo; con la IA desactivada no se abre nada", async () => {
    const cyclesBefore = (await listCycles(ctx)).length;
    const edu = await requireProjectAccess(fx.actors.edu, fx.projectA.id);
    await expect(prepareNextMonthCalendar(edu, {})).rejects.toThrow(/pide a la persona responsable/);
    await updateAiSettings(ctx, { aiEnabled: false, aiMonthlyLimitUsd: 5 });
    await expect(prepareNextMonthCalendar(ctx, {})).rejects.toBeInstanceOf(ForbiddenError);
    expect(await listCycles(ctx)).toHaveLength(cyclesBefore);
    expect(fakeAi.requests).toHaveLength(0);
  });
});
