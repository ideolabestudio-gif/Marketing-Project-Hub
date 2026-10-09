/**
 * Fixture estándar de aislamiento (docs/06-pruebas-aislamiento.md §6.1).
 * Todo texto del proyecto A lleva ALFA-SECRET y todo texto de B lleva BETA-SECRET, para
 * poder buscar en cualquier salida si se ha colado algo del otro proyecto.
 */
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { channels, clients, projectMemberships, projects, users } from "@/lib/db/schema";
import { requireProjectAccess } from "@/modules/access/context";
import { saveBrandProfile } from "@/modules/brand/service";
import {
  addComment,
  addLibraryFile,
  addLibraryLink,
  createItem,
  getItemDetail,
  saveVersion,
  uploadAsset,
} from "@/modules/content/service";
import { openCycle } from "@/modules/cycles/service";
import {
  applyReportInterpretation,
  generateCalendarPlan,
  generateCopyDraft,
  generateIdeas,
  generateReportInterpretation,
} from "@/modules/ai/service";
import { recordMetricValue, uploadMetricCsv } from "@/modules/metrics/service";
import { updateAiSettings } from "@/modules/projects/service";
import { createReport, getReport, updateReportSection } from "@/modules/reports/service";
import {
  decideInternal,
  recordClientDecision,
  recordPublication,
  submitForReview,
} from "@/modules/review/service";
import type { Actor } from "@/modules/identity/actor";
import { fakeAi } from "./fake-ai";
import { MARKER_A, MARKER_B } from "./markers";

export { MARKER_A, MARKER_B };

/** Vacía todas las tablas (incluida la auditoría, saltándose sus triggers solo en pruebas). */
export async function resetDatabase(): Promise<void> {
  await getDb().transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL session_replication_role = replica`);
    const rows = await tx.execute<{ tablename: string }>(
      // El catálogo de métricas es global (no es dato de cliente) y lo siembra la migración.
      sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'metric_definitions'`,
    );
    const names = rows.map((r) => `"${r.tablename}"`).join(", ");
    if (names) await tx.execute(sql.raw(`TRUNCATE ${names} CASCADE`));
  });
}

function toActor(u: typeof users.$inferSelect): Actor {
  return Object.freeze({ userId: u.id, email: u.email, name: u.name, isAdmin: u.isAdmin });
}

export async function seedTwoProjects() {
  await resetDatabase();
  const db = getDb();

  const [ana, edu, bea, mix, rev, admin, rob] = await db
    .insert(users)
    .values([
      { email: "ana@ideolab.test", name: "Ana" },
      { email: "edu@ideolab.test", name: "Edu" },
      { email: "bea@ideolab.test", name: "Bea" },
      { email: "mix@ideolab.test", name: "Mix" },
      { email: "rev@ideolab.test", name: "Rev" },
      { email: "admin@ideolab.test", name: "Admin", isAdmin: true },
      { email: "rob@ideolab.test", name: "Rob" },
    ])
    .returning();

  const [clientA, clientB] = await db
    .insert(clients)
    .values([{ name: `Cliente ${MARKER_A}` }, { name: `Cliente ${MARKER_B}` }])
    .returning();

  const [projectA, projectB] = await db
    .insert(projects)
    .values([
      { clientId: clientA.id, name: `Proyecto ${MARKER_A}`, slug: "alfa" },
      { clientId: clientB.id, name: `Proyecto ${MARKER_B}`, slug: "beta" },
    ])
    .returning();

  const [channelA, channelB] = await db
    .insert(channels)
    .values([
      { projectId: projectA.id, kind: "social", platform: "instagram", displayName: `IG ${MARKER_A}`, handle: "@alfa" },
      { projectId: projectB.id, kind: "social", platform: "instagram", displayName: `IG ${MARKER_B}`, handle: "@beta" },
    ])
    .returning();

  await db.insert(projectMemberships).values([
    { projectId: projectA.id, userId: ana.id, role: "manager" },
    { projectId: projectA.id, userId: edu.id, role: "editor" },
    { projectId: projectA.id, userId: rev.id, role: "reviewer" },
    { projectId: projectA.id, userId: mix.id, role: "viewer" },
    { projectId: projectB.id, userId: bea.id, role: "manager" },
    { projectId: projectB.id, userId: mix.id, role: "editor" },
    { projectId: projectB.id, userId: rob.id, role: "reviewer" },
  ]);

  const actors = {
    ana: toActor(ana),
    edu: toActor(edu),
    bea: toActor(bea),
    mix: toActor(mix),
    rev: toActor(rev),
    admin: toActor(admin),
    rob: toActor(rob),
  };
  const contentA = await seedContent(actors.ana, projectA.id, channelA.id, MARKER_A);
  const contentB = await seedContent(actors.bea, projectB.id, channelB.id, MARKER_B);
  const reviewA = await seedReview(
    { manager: actors.ana, editor: actors.edu, reviewer: actors.rev },
    projectA.id,
    contentA.cycle.id,
    channelA.id,
    MARKER_A,
  );
  const reviewB = await seedReview(
    { manager: actors.bea, editor: actors.mix, reviewer: actors.rob },
    projectB.id,
    contentB.cycle.id,
    channelB.id,
    MARKER_B,
  );

  const metricsA = await seedMetrics(actors.ana, projectA.id, contentA.cycle.id, channelA.id, MARKER_A);
  const metricsB = await seedMetrics(actors.bea, projectB.id, contentB.cycle.id, channelB.id, MARKER_B);
  // Antes que la IA: así sus contextos incluyen la ficha y la biblioteca de cada proyecto.
  const brandA = await seedBrand(actors.ana, projectA.id, MARKER_A);
  const brandB = await seedBrand(actors.bea, projectB.id, MARKER_B);
  const aiA = await seedAi(actors.ana, projectA.id, contentA.cycle.id, contentA.item.id, MARKER_A);
  const aiB = await seedAi(actors.bea, projectB.id, contentB.cycle.id, contentB.item.id, MARKER_B);

  return {
    users: { ana, edu, bea, mix, rev, admin, rob },
    actors,
    clientA,
    clientB,
    projectA,
    projectB,
    channelA,
    channelB,
    contentA,
    contentB,
    reviewA,
    reviewB,
    metricsA,
    metricsB,
    brandA,
    brandB,
    aiA,
    aiB,
  };
}

/** PNG real de 1×1 píxel. */
export const TINY_PNG = Uint8Array.from(
  Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64"),
);

/** El mismo periodo (2026-10) en ambos proyectos: el aislamiento no puede depender del mes. */
export const FIXTURE_PERIOD = "2026-10";

/**
 * Contenido de un proyecto creado con los servicios reales: ciclo, pieza con dos
 * versiones (texto y luego archivo) y un comentario. Todo lleva el marcador.
 */
async function seedContent(manager: Actor, projectId: string, channelId: string, marker: string) {
  const ctx = await requireProjectAccess(manager, projectId);
  const cycle = await openCycle(ctx, { period: FIXTURE_PERIOD });
  const item = await createItem(ctx, {
    cycleId: cycle.id,
    channelId,
    format: "post",
    title: `Pieza ${marker}`,
    plannedAt: `${FIXTURE_PERIOD}-05T10:00`,
  });
  await saveVersion(ctx, { itemId: item.id, body: `Copy ${marker} con #hashtag`, note: `v1 ${marker}` });
  const v2 = await uploadAsset(ctx, { itemId: item.id, filename: `imagen-${marker}.png`, bytes: TINY_PNG });
  const detail = await getItemDetail(ctx, item.id);
  const asset = detail.currentAssets[0];
  await addComment(ctx, { itemId: item.id, body: `Comentario ${marker}` });
  return { cycle, item, latestVersionId: v2.id, asset };
}

/**
 * Flujo de revisión real en un proyecto:
 * - `inReview`: pieza escrita por el editor y enviada a revisión (pendiente de aprobación interna).
 * - `scheduled`: pieza escrita por el editor, aprobada por el revisor y por el cliente
 *   (registrado por el responsable) y programada.
 */
async function seedReview(
  people: { manager: Actor; editor: Actor; reviewer: Actor },
  projectId: string,
  cycleId: string,
  channelId: string,
  marker: string,
) {
  const asEditor = await requireProjectAccess(people.editor, projectId);
  const asReviewer = await requireProjectAccess(people.reviewer, projectId);
  const asManager = await requireProjectAccess(people.manager, projectId);

  const inReview = await createItem(asEditor, { cycleId, channelId, format: "reel", title: `En revisión ${marker}` });
  const inReviewVersion = await saveVersion(asEditor, { itemId: inReview.id, body: `Reel ${marker}` });
  await submitForReview(asEditor, { itemId: inReview.id, versionId: inReviewVersion.id });

  const scheduled = await createItem(asEditor, {
    cycleId,
    channelId,
    format: "post",
    title: `Programada ${marker}`,
    plannedAt: `${FIXTURE_PERIOD}-20T12:00`,
  });
  const v = await saveVersion(asEditor, { itemId: scheduled.id, body: `Post aprobado ${marker}` });
  await submitForReview(asEditor, { itemId: scheduled.id, versionId: v.id });
  await decideInternal(asReviewer, { itemId: scheduled.id, versionId: v.id, decision: "approved" });
  await recordClientDecision(asManager, {
    itemId: scheduled.id,
    versionId: v.id,
    decision: "approved",
    approverName: `Cliente ${marker}`,
    evidence: `Email del cliente ${marker}: OK`,
  });
  const publication = await recordPublication(asManager, {
    itemId: scheduled.id,
    versionId: v.id,
    status: "scheduled",
    at: `${FIXTURE_PERIOD}-20T12:00`,
    externalUrl: "https://example.com/post",
  });
  return {
    inReview: { item: inReview, versionId: inReviewVersion.id },
    scheduled: { item: scheduled, versionId: v.id, publication },
  };
}

/**
 * Métricas e informe de un proyecto: un valor manual corregido (con historial), una
 * importación CSV pendiente y un informe en borrador con análisis escrito.
 */
async function seedMetrics(manager: Actor, projectId: string, cycleId: string, channelId: string, marker: string) {
  const ctx = await requireProjectAccess(manager, projectId);
  const first = await recordMetricValue(ctx, { cycleId, channelId, metricKey: "social.followers", value: "1.200" });
  const followers = await recordMetricValue(ctx, {
    cycleId,
    channelId,
    metricKey: "social.followers",
    value: "1.250",
    note: `Corrección ${marker}`,
  });
  const csvImport = await uploadMetricCsv(ctx, {
    cycleId,
    channelId,
    filename: `metricas-${marker}.csv`,
    text: `Fecha;Alcance;Seguidores;Nota\n2026-10-01;1.000;1.240;${marker}\n2026-10-02;500;1.250;${marker}\n`,
  });
  await createReport(ctx, { cycleId });
  const report = (await getReport(ctx, cycleId))!;
  const summary = report.sections.find((x) => x.kind === "human_analysis")!;
  await updateReportSection(ctx, { sectionId: summary.id, title: summary.title, body: `Resumen ${marker}` });
  return {
    firstValueId: first.id,
    followersValueId: followers.id,
    csvImport,
    report: report.report,
    sections: report.sections,
  };
}

/** Ficha del cliente (dos versiones) y biblioteca con un archivo y un enlace. */
async function seedBrand(manager: Actor, projectId: string, marker: string) {
  const ctx = await requireProjectAccess(manager, projectId);
  await saveBrandProfile(ctx, { about: `Cliente ${marker}`, voice: `Tono ${marker}` });
  const profile = await saveBrandProfile(ctx, {
    about: `Cliente ${marker}`,
    voice: `Tono cercano ${marker}`,
    avoid: `Evitar ${marker}`,
  });
  const libraryFile = await addLibraryFile(ctx, {
    category: "logo",
    title: `Logo ${marker}`,
    description: `Logo principal ${marker}`,
    filename: `logo-${marker}.png`,
    bytes: TINY_PNG,
  });
  const libraryLink = await addLibraryLink(ctx, {
    category: "photo",
    title: `Fotos ${marker}`,
    url: "https://example.com/fotos",
  });
  return { profile, libraryFile, libraryLink };
}

/**
 * IA activada, con un borrador de texto, ideas y dos interpretaciones del informe (una
 * ya añadida como sección, sin revisar, y otra pendiente). Requiere el proveedor falso.
 */
async function seedAi(manager: Actor, projectId: string, cycleId: string, itemId: string, marker: string) {
  const ctx = await requireProjectAccess(manager, projectId);
  await updateAiSettings(ctx, { aiEnabled: true, aiMonthlyLimitUsd: 5 });
  const copyDraft = await generateCopyDraft(ctx, { itemId, instructions: `Indicaciones ${marker}` });
  const ideas = await generateIdeas(ctx, { cycleId, instructions: `Ideas ${marker}` });
  const usedInterpretation = await generateReportInterpretation(ctx, { cycleId });
  const aiSection = await applyReportInterpretation(ctx, {
    generationId: usedInterpretation.id,
    title: `Lectura IA ${marker}`,
    body: `Interpretación ${marker}`,
  });
  const interpretation = await generateReportInterpretation(ctx, { cycleId, instructions: `Lectura ${marker}` });
  const calendarPlan = await withReply(calendarPlanReply(marker), () =>
    generateCalendarPlan(ctx, { cycleId, instructions: `Calendario ${marker}` }),
  );
  return { copyDraft, ideas, interpretation, aiSection, calendarPlan };
}

/**
 * Respuesta de ejemplo para una propuesta de calendario del mes del fixture: dos piezas
 * válidas en el único canal (C1) y una con la fecha fuera del mes, que se descarta.
 */
export function calendarPlanReply(marker: string, period = FIXTURE_PERIOD): string {
  return JSON.stringify({
    pieces: [
      { channel: "C1", format: "reel", date: `${period}-20T18:30`, title: `Reel ${marker}`, idea: `Idea reel ${marker}` },
      { channel: "C1", format: "post", date: `${period}-12T10:00`, title: `Post ${marker}`, idea: `Idea post ${marker}` },
      { channel: "C1", format: "post", date: "2030-01-01T10:00", title: `Fuera ${marker}`, idea: "Fuera del mes" },
    ],
  });
}

async function withReply<T>(reply: string, fn: () => Promise<T>): Promise<T> {
  const previous = fakeAi.reply;
  fakeAi.reply = reply;
  try {
    return await fn();
  } finally {
    fakeAi.reply = previous;
  }
}

export type Fixture = Awaited<ReturnType<typeof seedTwoProjects>>;
