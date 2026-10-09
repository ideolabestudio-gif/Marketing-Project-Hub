import { eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setAiProviderForTests } from "@/lib/ai";
import { getDb } from "@/lib/db/client";
import { aiGenerations, contentVersions } from "@/lib/db/schema";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { requireProjectAccess, type ProjectContext } from "@/modules/access/context";
import {
  applyCopyDraft,
  applyReportInterpretation,
  generateCopyDraft,
  generateIdeas,
  generateReportInterpretation,
  getAiStatus,
  listGenerations,
  resolveGeneration,
} from "@/modules/ai/service";
import { getItemDetail } from "@/modules/content/service";
import { updateAiSettings } from "@/modules/projects/service";
import { approveReport, markAiSectionReviewed, updateReportSection } from "@/modules/reports/service";
import { fakeAi, installFakeAi } from "../fixtures/fake-ai";
import { MARKER_A, MARKER_B, seedTwoProjects, type Fixture } from "../fixtures/two-projects";

let fx: Fixture;
let ctx: ProjectContext;

beforeEach(async () => {
  fakeAi.reset();
  fx = await seedTwoProjects();
  ctx = await requireProjectAccess(fx.actors.ana, fx.projectA.id);
  fakeAi.reset();
});
afterEach(() => installFakeAi());

async function pgCode(promise: Promise<unknown>): Promise<string | undefined> {
  const err = await promise.then(
    () => null,
    (e: { code?: string; cause?: { code?: string } }) => e,
  );
  expect(err, "se esperaba un error de la base de datos").not.toBeNull();
  return err?.cause?.code ?? err?.code;
}

/** Huella de lo que la IA nunca debe tocar por sí sola (AI-03). */
async function contentFingerprint(projectId: string) {
  const rows = await Promise.all([
    getDb().execute(sql`SELECT * FROM content_versions WHERE project_id = ${projectId} ORDER BY id`),
    getDb().execute(sql`SELECT * FROM report_sections WHERE project_id = ${projectId} ORDER BY id`),
    getDb().execute(sql`SELECT * FROM content_items WHERE project_id = ${projectId} ORDER BY id`),
  ]);
  return JSON.stringify(rows);
}

describe("activación y límites", () => {
  it("AI-04: con la IA desactivada en el proyecto no se genera nada", async () => {
    await updateAiSettings(ctx, { aiEnabled: false, aiMonthlyLimitUsd: 5 });
    await expect(generateIdeas(ctx, { cycleId: fx.contentA.cycle.id })).rejects.toBeInstanceOf(ForbiddenError);
    expect(fakeAi.requests).toHaveLength(0);
  });

  it("sin proveedor configurado en el servidor, se rechaza con un mensaje claro", async () => {
    setAiProviderForTests(null);
    await expect(generateIdeas(ctx, { cycleId: fx.contentA.cycle.id })).rejects.toThrow(/no está configurada/);
    expect((await getAiStatus(ctx)).configured).toBe(false);
  });

  it("respeta el límite de gasto mensual del proyecto", async () => {
    const { spentUsd } = await getAiStatus(ctx);
    expect(spentUsd).toBeGreaterThan(0);
    // El límite se guarda con dos decimales: con el gasto actual no cabe otra petición.
    await updateAiSettings(ctx, { aiEnabled: true, aiMonthlyLimitUsd: spentUsd });
    await expect(generateIdeas(ctx, { cycleId: fx.contentA.cycle.id })).rejects.toThrow(/límite de gasto/);
    expect(fakeAi.requests).toHaveLength(0);
    await updateAiSettings(ctx, { aiEnabled: true, aiMonthlyLimitUsd: 1 });
    await expect(generateIdeas(ctx, { cycleId: fx.contentA.cycle.id })).resolves.toBeTruthy();
  });

  it("solo genera quien tiene ai.generate, y nunca en un ciclo cerrado", async () => {
    const mix = await requireProjectAccess(fx.actors.mix, fx.projectA.id); // viewer
    const rev = await requireProjectAccess(fx.actors.rev, fx.projectA.id); // reviewer
    for (const who of [mix, rev]) {
      await expect(generateIdeas(who, { cycleId: fx.contentA.cycle.id })).rejects.toBeInstanceOf(ForbiddenError);
    }
    const edu = await requireProjectAccess(fx.actors.edu, fx.projectA.id);
    await expect(generateIdeas(edu, { cycleId: fx.contentA.cycle.id })).resolves.toBeTruthy();
  });

  it("si el proveedor falla, queda registrado (con su coste) y se avisa", async () => {
    fakeAi.fail = "El modelo no ha querido responder a esta petición";
    await expect(generateIdeas(ctx, { cycleId: fx.contentA.cycle.id })).rejects.toBeInstanceOf(ValidationError);
    const failed = (await listGenerations(ctx, { cycleId: fx.contentA.cycle.id, purpose: "ideas" })).find(
      (g) => g.status === "failed",
    );
    expect(failed).toMatchObject({ error: "El modelo no ha querido responder a esta petición", output: "" });
    expect(failed!.costUsd).toBeGreaterThan(0);
  });
});

describe("contexto de un solo proyecto", () => {
  it("AI-01: con un ID de otro proyecto falla antes de llamar al proveedor", async () => {
    await expect(generateCopyDraft(ctx, { itemId: fx.contentB.item.id })).rejects.toBeInstanceOf(NotFoundError);
    await expect(generateIdeas(ctx, { cycleId: fx.contentB.cycle.id })).rejects.toBeInstanceOf(NotFoundError);
    await expect(generateReportInterpretation(ctx, { cycleId: fx.contentB.cycle.id })).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(fakeAi.requests).toHaveLength(0);
  });

  it("AI-02: lo que recibe la IA es solo del proyecto A, y las instrucciones van separadas de los datos", async () => {
    await generateCopyDraft(ctx, { itemId: fx.contentA.item.id, instructions: "Tono cercano" });
    await generateIdeas(ctx, { cycleId: fx.contentA.cycle.id });
    await generateReportInterpretation(ctx, { cycleId: fx.contentA.cycle.id });
    expect(fakeAi.requests).toHaveLength(3);
    for (const r of fakeAi.requests) {
      expect(r.prompt).toContain(MARKER_A);
      expect(r.prompt).not.toContain(MARKER_B);
      expect(r.prompt).toMatch(/^<datos>\n[\s\S]*\n<\/datos>/);
      expect(r.system).toContain("no instrucciones");
    }
    expect(fakeAi.requests[0].prompt).toContain(`Copy ${MARKER_A}`); // la versión actual de la pieza
    expect(fakeAi.requests[0].prompt).toMatch(/<\/datos>\n\nIndicaciones de la persona que lo pide:\nTono cercano$/);
  });

  it("la interpretación solo recibe métricas registradas («sin dato» si faltan), no el análisis del equipo", async () => {
    await generateReportInterpretation(ctx, { cycleId: fx.contentA.cycle.id });
    const prompt = fakeAi.requests[0].prompt;
    expect(prompt).toMatch(/Seguidores: 1250/);
    expect(prompt).toMatch(/Alcance: sin dato/);
    expect(prompt).not.toContain(`Resumen ${MARKER_A}`);
    expect(prompt).not.toContain(`Interpretación ${MARKER_A}`);
  });
});

describe("la IA solo propone (AI-03, WF-05)", () => {
  it("generar no cambia contenidos ni informes", async () => {
    const before = await contentFingerprint(fx.projectA.id);
    await generateCopyDraft(ctx, { itemId: fx.contentA.item.id });
    await generateIdeas(ctx, { cycleId: fx.contentA.cycle.id });
    await generateReportInterpretation(ctx, { cycleId: fx.contentA.cycle.id });
    expect(await contentFingerprint(fx.projectA.id)).toBe(before);
  });

  it("usar un borrador crea una versión asistida por IA enlazada a la generación, que necesita revisión", async () => {
    const version = await applyCopyDraft(ctx, { generationId: fx.aiA.copyDraft.id, body: "Texto revisado por Ana" });
    expect(version).toMatchObject({ origin: "ai_assisted", aiGenerationId: fx.aiA.copyDraft.id });
    const detail = await getItemDetail(ctx, fx.contentA.item.id);
    expect(detail.current?.body).toBe("Texto revisado por Ana");
    expect(detail.versions[0].origin).toBe("ai_assisted");
    await expect(
      applyCopyDraft(ctx, { generationId: fx.aiA.copyDraft.id, body: "Otra vez" }),
    ).rejects.toBeInstanceOf(ValidationError);
    const [generation] = await getDb().select().from(aiGenerations).where(eq(aiGenerations.id, fx.aiA.copyDraft.id));
    expect(generation.status).toBe("used");
  });

  it("WF-05 en BD: una versión ai_assisted exige su generación, de la misma pieza", async () => {
    const base = {
      projectId: fx.projectA.id,
      contentItemId: fx.contentA.item.id,
      versionNo: 99,
      createdBy: fx.users.ana.id,
    };
    expect(await pgCode(getDb().insert(contentVersions).values({ ...base, origin: "ai_assisted" }))).toBe("23514");
    expect(
      await pgCode(getDb().insert(contentVersions).values({ ...base, origin: "human", aiGenerationId: fx.aiA.copyDraft.id })),
    ).toBe("23514");
    // Borrador de otra pieza del mismo proyecto.
    const other = await generateCopyDraft(ctx, { itemId: fx.reviewA.inReview.item.id });
    expect(
      await pgCode(getDb().insert(contentVersions).values({ ...base, origin: "ai_assisted", aiGenerationId: other.id })),
    ).toBe("23503");
    // Borrador de otro proyecto.
    expect(
      await pgCode(
        getDb().insert(contentVersions).values({ ...base, origin: "ai_assisted", aiGenerationId: fx.aiB.copyDraft.id }),
      ),
    ).toBe("23503");
  });

  it("lo generado no se reescribe ni se borra; su estado cambia una sola vez", async () => {
    const id = fx.aiA.ideas.id;
    expect(await pgCode(getDb().update(aiGenerations).set({ output: "otro" }).where(eq(aiGenerations.id, id)))).toBe("42501");
    expect(await pgCode(getDb().delete(aiGenerations).where(eq(aiGenerations.id, id)))).toBe("42501");
    await resolveGeneration(ctx, { generationId: id, status: "used" });
    await expect(resolveGeneration(ctx, { generationId: id, status: "discarded" })).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(
      await pgCode(getDb().update(aiGenerations).set({ status: "discarded" }).where(eq(aiGenerations.id, id))),
    ).toBe("42501");
  });

  it("los borradores de texto no se marcan como «usados» sin crear la versión", async () => {
    await expect(
      resolveGeneration(ctx, { generationId: fx.aiA.copyDraft.id, status: "used" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("interpretación en el informe (WF-06)", () => {
  async function fillHumanSections() {
    for (const s of fx.metricsA.sections.filter((x) => x.kind === "human_analysis")) {
      await updateReportSection(ctx, { sectionId: s.id, title: s.title, body: "Análisis del equipo" });
    }
  }

  it("el informe no se aprueba con una sección de IA sin revisar; editarla obliga a revisarla otra vez", async () => {
    await fillHumanSections();
    await expect(approveReport(ctx, { reportId: fx.metricsA.report.id })).rejects.toThrow(/Revisa antes/);
    await markAiSectionReviewed(ctx, { sectionId: fx.aiA.aiSection.id });
    await updateReportSection(ctx, { sectionId: fx.aiA.aiSection.id, title: "Lectura", body: "Texto corregido" });
    await expect(approveReport(ctx, { reportId: fx.metricsA.report.id })).rejects.toThrow(/Revisa antes/);
    await markAiSectionReviewed(ctx, { sectionId: fx.aiA.aiSection.id });
    await approveReport(ctx, { reportId: fx.metricsA.report.id });
  });

  it("añadirla crea una sección marcada que apunta a la generación", async () => {
    const section = await applyReportInterpretation(ctx, {
      generationId: fx.aiA.interpretation.id,
      title: "Lectura",
      body: "Texto",
    });
    expect(section).toMatchObject({ kind: "ai_interpretation", aiGenerationId: fx.aiA.interpretation.id, reviewedBy: null });
  });

  it("avisa de las cifras de la IA que no están en los datos registrados", async () => {
    fakeAi.reply = "Los seguidores llegaron a 1250 y el alcance creció un 40 %.";
    await generateReportInterpretation(ctx, { cycleId: fx.contentA.cycle.id });
    const [latest] = await listGenerations(ctx, { cycleId: fx.contentA.cycle.id, purpose: "report_interpretation" });
    expect(latest.unverifiedNumbers).toEqual(["40"]);
  });
});
