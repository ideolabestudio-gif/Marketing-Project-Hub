import { NotFoundError } from "@/lib/errors";
import type { ProjectContext } from "@/modules/access/context";
import * as access from "@/modules/access/service";
import * as ai from "@/modules/ai/service";
import * as content from "@/modules/content/service";
import * as cycles from "@/modules/cycles/service";
import type { Actor } from "@/modules/identity/actor";
import * as identity from "@/modules/identity/service";
import * as metrics from "@/modules/metrics/service";
import { findDefinition } from "@/modules/metrics/repo";
import * as reports from "@/modules/reports/service";
import * as projects from "@/modules/projects/service";
import * as review from "@/modules/review/service";
import { calendarPlanReply, FIXTURE_PERIOD, TINY_PNG, type Fixture } from "../fixtures/two-projects";

/**
 * Registro de TODAS las funciones exportadas por los `service.ts` de los módulos.
 * La prueba de cobertura falla si aparece una función nueva sin clasificar aquí,
 * así ningún servicio queda fuera de las pruebas de aislamiento (SV-01..03).
 *
 * - project: recibe un ProjectContext. `own` se llama con el contexto del proyecto A
 *   (como manager) y su resultado no puede contener datos de B. `foreign` intenta
 *   usar IDs de B con el contexto de A y debe fallar con NotFoundError sin efectos.
 * - admin: solo administradores. Un no administrador recibe ForbiddenError.
 * - actor: datos del propio usuario, con prueba específica.
 * - internal: no se expone a la UI con datos de proyecto; motivo obligatorio.
 */
export type ServiceCase =
  | {
      kind: "project";
      own: (ctxA: ProjectContext, fx: Fixture) => Promise<unknown>;
      foreign: ((ctxA: ProjectContext, fx: Fixture) => Promise<unknown>) | { none: string };
    }
  | { kind: "admin"; call: (actor: Actor, fx: Fixture) => Promise<unknown> }
  | { kind: "actor"; reason: string }
  | { kind: "internal"; reason: string };

export const SERVICE_CASES: Record<string, ServiceCase> = {
  // --- access ---
  "access.listMyProjects": { kind: "actor", reason: "Probado en service-isolation.test.ts (SV-01 por usuario)" },
  "access.listProjectMembers": {
    kind: "project",
    own: (ctx) => access.listProjectMembers(ctx),
    foreign: { none: "No recibe IDs: el proyecto sale del contexto" },
  },
  "access.adminListProjectMembers": {
    kind: "admin",
    call: (a, fx) => access.adminListProjectMembers(a, fx.projectA.id),
  },
  "access.adminSetMembership": {
    kind: "admin",
    call: (a, fx) => access.adminSetMembership(a, { projectId: fx.projectA.id, userId: fx.users.edu.id, role: "editor" }),
  },
  "access.adminRemoveMembership": {
    kind: "admin",
    call: (a, fx) => access.adminRemoveMembership(a, { projectId: fx.projectA.id, userId: fx.users.edu.id }),
  },

  // --- identity ---
  "identity.normalizeEmail": { kind: "internal", reason: "Función pura sin datos" },
  "identity.loginWithGoogle": { kind: "internal", reason: "Flujo de login, sin contexto de proyecto; ver identity.test.ts" },
  "identity.adminListUsers": { kind: "admin", call: (a) => identity.adminListUsers(a) },
  "identity.adminInviteUser": { kind: "admin", call: (a) => identity.adminInviteUser(a, { email: "nuevo@ideolab.test" }) },
  "identity.adminSetUserActive": {
    kind: "admin",
    call: (a, fx) => identity.adminSetUserActive(a, { userId: fx.users.edu.id, active: true }),
  },

  // --- projects ---
  "projects.getProject": {
    kind: "project",
    own: (ctx) => projects.getProject(ctx),
    foreign: { none: "No recibe IDs: el proyecto sale del contexto" },
  },
  "projects.updateProjectSettings": {
    kind: "project",
    own: (ctx) => projects.updateProjectSettings(ctx, {
        timezone: "Europe/Madrid",
        locale: "es-ES",
        requireClientApproval: true,
        separationOfDuties: true,
      }),
    foreign: { none: "No recibe IDs: el proyecto sale del contexto" },
  },
  "projects.updateAiSettings": {
    kind: "project",
    own: (ctx) => projects.updateAiSettings(ctx, { aiEnabled: true, aiMonthlyLimitUsd: 10 }),
    foreign: { none: "No recibe IDs: el proyecto sale del contexto" },
  },
  "projects.listChannels": {
    kind: "project",
    own: (ctx) => projects.listChannels(ctx),
    foreign: { none: "No recibe IDs: el proyecto sale del contexto" },
  },
  "projects.createChannel": {
    kind: "project",
    own: (ctx) => projects.createChannel(ctx, { platform: "linkedin", displayName: "LinkedIn" }),
    foreign: { none: "No recibe IDs: el canal se crea siempre en el proyecto del contexto" },
  },
  "projects.setChannelActive": {
    kind: "project",
    own: (ctx, fx) => projects.setChannelActive(ctx, { channelId: fx.channelA.id, active: true }),
    foreign: (ctx, fx) => projects.setChannelActive(ctx, { channelId: fx.channelB.id, active: false }),
  },
  "projects.adminListClients": { kind: "admin", call: (a) => projects.adminListClients(a) },
  "projects.adminCreateClient": { kind: "admin", call: (a) => projects.adminCreateClient(a, { name: "Cliente nuevo" }) },
  "projects.adminListProjects": { kind: "admin", call: (a) => projects.adminListProjects(a) },
  "projects.adminGetProject": { kind: "admin", call: (a, fx) => projects.adminGetProject(a, fx.projectA.id) },
  "projects.adminCreateProject": {
    kind: "admin",
    call: (a, fx) => projects.adminCreateProject(a, { clientId: fx.clientA.id, name: "Otro", slug: "otro" }),
  },
  "projects.adminSetProjectStatus": {
    kind: "admin",
    call: (a, fx) => projects.adminSetProjectStatus(a, { projectId: fx.projectA.id, status: "active" }),
  },

  // --- cycles ---
  "cycles.listCycles": {
    kind: "project",
    own: (ctx) => cycles.listCycles(ctx),
    foreign: { none: "No recibe IDs: el proyecto sale del contexto" },
  },
  "cycles.getCycle": {
    kind: "project",
    own: (ctx, fx) => cycles.getCycle(ctx, fx.contentA.cycle.id),
    foreign: (ctx, fx) => cycles.getCycle(ctx, fx.contentB.cycle.id),
  },
  "cycles.getCycleByPeriod": {
    kind: "project",
    own: (ctx) => cycles.getCycleByPeriod(ctx, FIXTURE_PERIOD),
    foreign: { none: "Ambos proyectos tienen el mismo mes: la prueba own comprueba que se resuelve el de A" },
  },
  "cycles.openCycle": {
    kind: "project",
    own: (ctx) => cycles.openCycle(ctx, { period: "2026-11" }),
    foreign: { none: "No recibe IDs: el ciclo se crea en el proyecto del contexto" },
  },
  "cycles.updateCycleBrief": {
    kind: "project",
    own: (ctx, fx) => cycles.updateCycleBrief(ctx, { cycleId: fx.contentA.cycle.id, objectives: "Ventas" }),
    foreign: (ctx, fx) => cycles.updateCycleBrief(ctx, { cycleId: fx.contentB.cycle.id, objectives: "Intruso" }),
  },
  "cycles.setCycleStatus": {
    kind: "project",
    own: (ctx, fx) => cycles.setCycleStatus(ctx, { cycleId: fx.contentA.cycle.id, status: "production" }),
    foreign: (ctx, fx) => cycles.setCycleStatus(ctx, { cycleId: fx.contentB.cycle.id, status: "production" }),
  },
  "cycles.closeCycle": {
    kind: "project",
    own: async (ctx, fx) => {
      await approveReportA(ctx, fx);
      return cycles.closeCycle(ctx, { cycleId: fx.contentA.cycle.id, learnings: "Funcionaron los reels" });
    },
    foreign: (ctx, fx) => cycles.closeCycle(ctx, { cycleId: fx.contentB.cycle.id, learnings: "Intruso intruso" }),
  },
  "cycles.reopenCycle": {
    kind: "project",
    own: async (ctx, fx) => {
      await approveReportA(ctx, fx);
      await cycles.closeCycle(ctx, { cycleId: fx.contentA.cycle.id, learnings: "Funcionaron los reels" });
      return cycles.reopenCycle(ctx, { cycleId: fx.contentA.cycle.id, reason: "Falta un dato" });
    },
    foreign: (ctx, fx) => cycles.reopenCycle(ctx, { cycleId: fx.contentB.cycle.id, reason: "Intruso" }),
  },
  "cycles.assertCycleWritable": { kind: "internal", reason: "Función pura sobre un ciclo ya cargado con contexto" },

  // --- content ---
  "content.listItems": {
    kind: "project",
    own: (ctx, fx) => content.listItems(ctx, fx.contentA.cycle.id),
    foreign: (ctx, fx) => content.listItems(ctx, fx.contentB.cycle.id),
  },
  "content.getItemDetail": {
    kind: "project",
    own: (ctx, fx) => content.getItemDetail(ctx, fx.contentA.item.id),
    foreign: (ctx, fx) => content.getItemDetail(ctx, fx.contentB.item.id),
  },
  "content.getVersion": {
    kind: "project",
    own: (ctx, fx) => content.getVersion(ctx, { itemId: fx.contentA.item.id, versionNo: 1 }),
    foreign: (ctx, fx) => content.getVersion(ctx, { itemId: fx.contentB.item.id, versionNo: 1 }),
  },
  "content.compareVersions": {
    kind: "project",
    own: (ctx, fx) => content.compareVersions(ctx, { itemId: fx.contentA.item.id, fromNo: 1, toNo: 2 }),
    foreign: (ctx, fx) => content.compareVersions(ctx, { itemId: fx.contentB.item.id, fromNo: 1, toNo: 2 }),
  },
  "content.getAssetFile": {
    kind: "project",
    own: (ctx, fx) => content.getAssetFile(ctx, fx.contentA.asset.id),
    foreign: (ctx, fx) => content.getAssetFile(ctx, fx.contentB.asset.id),
  },
  "content.createItem": {
    kind: "project",
    own: (ctx, fx) =>
      content.createItem(ctx, { cycleId: fx.contentA.cycle.id, channelId: fx.channelA.id, format: "reel", title: "Nueva" }),
    foreign: (ctx, fx) =>
      content.createItem(ctx, { cycleId: fx.contentB.cycle.id, channelId: fx.channelA.id, format: "reel", title: "X" }),
  },
  "content.updateItem": {
    kind: "project",
    own: (ctx, fx) =>
      content.updateItem(ctx, { itemId: fx.contentA.item.id, channelId: fx.channelA.id, format: "post", title: "Otro título" }),
    foreign: (ctx, fx) =>
      content.updateItem(ctx, { itemId: fx.contentB.item.id, channelId: fx.channelA.id, format: "post", title: "X" }),
  },
  "content.setItemCancelled": {
    kind: "project",
    own: (ctx, fx) => content.setItemCancelled(ctx, { itemId: fx.contentA.item.id, cancelled: true }),
    foreign: (ctx, fx) => content.setItemCancelled(ctx, { itemId: fx.contentB.item.id, cancelled: true }),
  },
  "content.saveVersion": {
    kind: "project",
    own: (ctx, fx) => content.saveVersion(ctx, { itemId: fx.contentA.item.id, body: "Texto nuevo" }),
    foreign: (ctx, fx) => content.saveVersion(ctx, { itemId: fx.contentB.item.id, body: "Intruso" }),
  },
  "content.uploadAsset": {
    kind: "project",
    own: (ctx, fx) => content.uploadAsset(ctx, { itemId: fx.contentA.item.id, filename: "a.png", bytes: TINY_PNG }),
    foreign: (ctx, fx) => content.uploadAsset(ctx, { itemId: fx.contentB.item.id, filename: "b.png", bytes: TINY_PNG }),
  },
  "content.addLinkAsset": {
    kind: "project",
    own: (ctx, fx) => content.addLinkAsset(ctx, { itemId: fx.contentA.item.id, url: "https://example.com/diseno" }),
    foreign: (ctx, fx) => content.addLinkAsset(ctx, { itemId: fx.contentB.item.id, url: "https://example.com/x" }),
  },
  "content.removeAsset": {
    kind: "project",
    own: (ctx, fx) => content.removeAsset(ctx, { itemId: fx.contentA.item.id, assetId: fx.contentA.asset.id }),
    // Pieza propia + activo ajeno: el caso más sutil.
    foreign: (ctx, fx) => content.removeAsset(ctx, { itemId: fx.contentA.item.id, assetId: fx.contentB.asset.id }),
  },
  "content.addComment": {
    kind: "project",
    own: (ctx, fx) => content.addComment(ctx, { itemId: fx.contentA.item.id, body: "Bien" }),
    foreign: (ctx, fx) => content.addComment(ctx, { itemId: fx.contentB.item.id, body: "Intruso" }),
  },

  // --- review (aprobaciones y publicaciones) ---
  // ctxA es de Ana (responsable de A). Las piezas de reviewA las escribió Edu, así que
  // Ana puede aprobarlas aunque la separación de funciones esté activa.
  "review.getItemReview": {
    kind: "project",
    own: (ctx, fx) => review.getItemReview(ctx, fx.reviewA.scheduled.item.id),
    foreign: (ctx, fx) => review.getItemReview(ctx, fx.reviewB.scheduled.item.id),
  },
  "review.listCycleStatuses": {
    kind: "project",
    own: (ctx, fx) => review.listCycleStatuses(ctx, fx.contentA.cycle.id),
    foreign: (ctx, fx) => review.listCycleStatuses(ctx, fx.contentB.cycle.id),
  },
  "review.submitForReview": {
    kind: "project",
    own: (ctx, fx) => review.submitForReview(ctx, { itemId: fx.contentA.item.id, versionId: fx.contentA.latestVersionId }),
    foreign: (ctx, fx) =>
      review.submitForReview(ctx, { itemId: fx.contentB.item.id, versionId: fx.contentB.latestVersionId }),
  },
  "review.decideInternal": {
    kind: "project",
    own: (ctx, fx) =>
      review.decideInternal(ctx, {
        itemId: fx.reviewA.inReview.item.id,
        versionId: fx.reviewA.inReview.versionId,
        decision: "approved",
      }),
    foreign: (ctx, fx) =>
      review.decideInternal(ctx, {
        itemId: fx.reviewB.inReview.item.id,
        versionId: fx.reviewB.inReview.versionId,
        decision: "approved",
      }),
  },
  "review.recordClientDecision": {
    kind: "project",
    own: async (ctx, fx) => {
      const { item, versionId } = fx.reviewA.inReview;
      await review.decideInternal(ctx, { itemId: item.id, versionId, decision: "approved" });
      return review.recordClientDecision(ctx, {
        itemId: item.id,
        versionId,
        decision: "approved",
        approverName: "Cliente",
        evidence: "Email: OK",
      });
    },
    foreign: (ctx, fx) =>
      review.recordClientDecision(ctx, {
        itemId: fx.reviewB.inReview.item.id,
        versionId: fx.reviewB.inReview.versionId,
        decision: "approved",
        approverName: "Intruso",
        evidence: "Intruso",
      }),
  },
  "review.recordPublication": {
    kind: "project",
    own: async (ctx, fx) => {
      const { item, versionId } = fx.reviewA.inReview;
      await review.decideInternal(ctx, { itemId: item.id, versionId, decision: "approved" });
      await review.recordClientDecision(ctx, {
        itemId: item.id,
        versionId,
        decision: "approved",
        approverName: "Cliente",
        evidence: "Email: OK",
      });
      return review.recordPublication(ctx, { itemId: item.id, versionId, status: "published", at: "2026-10-21T09:00" });
    },
    foreign: (ctx, fx) =>
      review.recordPublication(ctx, {
        itemId: fx.reviewB.scheduled.item.id,
        versionId: fx.reviewB.scheduled.versionId,
        status: "published",
        at: "2026-10-21T09:00",
      }),
  },
  "review.markPublished": {
    kind: "project",
    own: (ctx, fx) =>
      review.markPublished(ctx, { publicationId: fx.reviewA.scheduled.publication.id, at: "2026-10-20T12:05" }),
    foreign: (ctx, fx) =>
      review.markPublished(ctx, { publicationId: fx.reviewB.scheduled.publication.id, at: "2026-10-20T12:05" }),
  },
  "review.cancelPublication": {
    kind: "project",
    own: (ctx, fx) =>
      review.cancelPublication(ctx, { publicationId: fx.reviewA.scheduled.publication.id, reason: "Corregir copy" }),
    foreign: (ctx, fx) =>
      review.cancelPublication(ctx, { publicationId: fx.reviewB.scheduled.publication.id, reason: "Intruso" }),
  },
  "review.assertContentEditable": {
    kind: "internal",
    reason: "Comprobación usada por content; busca solo dentro del proyecto del contexto y no devuelve datos",
  },
  "review.listCyclePublications": {
    kind: "project",
    own: (ctx, fx) => review.listCyclePublications(ctx, fx.contentA.cycle.id),
    foreign: (ctx, fx) => review.listCyclePublications(ctx, fx.contentB.cycle.id),
  },
  "review.listMyPendingWork": { kind: "actor", reason: "Probado en review.test.ts (cada usuario ve solo lo suyo)" },
  "review.isLocked": { kind: "internal", reason: "Función pura sobre un estado" },

  // --- audit ---
  "audit.recordAudit": { kind: "internal", reason: "Solo escribe; lo usan los demás servicios" },

  // --- ai ---
  "ai.getAiStatus": {
    kind: "project",
    own: (ctx) => ai.getAiStatus(ctx),
    foreign: { none: "No recibe IDs: el proyecto sale del contexto" },
  },
  "ai.generateCopyDraft": {
    kind: "project",
    own: (ctx, fx) => ai.generateCopyDraft(ctx, { itemId: fx.contentA.item.id }),
    foreign: (ctx, fx) => ai.generateCopyDraft(ctx, { itemId: fx.contentB.item.id }),
  },
  "ai.generateIdeas": {
    kind: "project",
    own: (ctx, fx) => ai.generateIdeas(ctx, { cycleId: fx.contentA.cycle.id }),
    foreign: (ctx, fx) => ai.generateIdeas(ctx, { cycleId: fx.contentB.cycle.id }),
  },
  "ai.generateCalendarPlan": {
    kind: "project",
    own: (ctx, fx) => ai.generateCalendarPlan(ctx, { cycleId: fx.contentA.cycle.id }),
    foreign: (ctx, fx) => ai.generateCalendarPlan(ctx, { cycleId: fx.contentB.cycle.id }),
  },
  "ai.prepareNextMonthCalendar": {
    kind: "project",
    own: (ctx) => ai.prepareNextMonthCalendar(ctx, { instructions: "Mes que viene" }),
    foreign: { none: "No recibe IDs: el proyecto y el mes salen del contexto" },
  },
  "ai.getCalendarPlanChatPrompt": {
    kind: "project",
    own: (ctx, fx) => ai.getCalendarPlanChatPrompt(ctx, { cycleId: fx.contentA.cycle.id }),
    foreign: (ctx, fx) => ai.getCalendarPlanChatPrompt(ctx, { cycleId: fx.contentB.cycle.id }),
  },
  "ai.importCalendarPlan": {
    kind: "project",
    own: (ctx, fx) => ai.importCalendarPlan(ctx, { cycleId: fx.contentA.cycle.id, output: calendarPlanReply("pegada") }),
    foreign: (ctx, fx) =>
      ai.importCalendarPlan(ctx, { cycleId: fx.contentB.cycle.id, output: calendarPlanReply("intrusa") }),
  },
  "ai.applyCalendarPlan": {
    kind: "project",
    own: (ctx, fx) =>
      ai.applyCalendarPlan(ctx, {
        generationId: fx.aiA.calendarPlan.id,
        entries: [{ index: 0, title: "Reel elegido", plannedAt: `${FIXTURE_PERIOD}-21T18:30` }],
      }),
    foreign: (ctx, fx) =>
      ai.applyCalendarPlan(ctx, {
        generationId: fx.aiB.calendarPlan.id,
        entries: [{ index: 0, title: "Intruso", plannedAt: `${FIXTURE_PERIOD}-21T18:30` }],
      }),
  },
  "ai.generateReportInterpretation": {
    kind: "project",
    own: (ctx, fx) => ai.generateReportInterpretation(ctx, { cycleId: fx.contentA.cycle.id }),
    foreign: (ctx, fx) => ai.generateReportInterpretation(ctx, { cycleId: fx.contentB.cycle.id }),
  },
  "ai.listGenerations": {
    kind: "project",
    own: (ctx, fx) => ai.listGenerations(ctx, { cycleId: fx.contentA.cycle.id, contentItemId: fx.contentA.item.id }),
    foreign: async (ctx, fx) => {
      await expectNotFound(ai.listGenerations(ctx, { cycleId: fx.contentA.cycle.id, contentItemId: fx.contentB.item.id }));
      return ai.listGenerations(ctx, { cycleId: fx.contentB.cycle.id, purpose: "report_interpretation" });
    },
  },
  "ai.applyCopyDraft": {
    kind: "project",
    own: (ctx, fx) => ai.applyCopyDraft(ctx, { generationId: fx.aiA.copyDraft.id, body: "Texto revisado" }),
    foreign: (ctx, fx) => ai.applyCopyDraft(ctx, { generationId: fx.aiB.copyDraft.id, body: "Intruso" }),
  },
  "ai.applyReportInterpretation": {
    kind: "project",
    own: (ctx, fx) =>
      ai.applyReportInterpretation(ctx, { generationId: fx.aiA.interpretation.id, title: "Lectura", body: "Texto" }),
    foreign: (ctx, fx) =>
      ai.applyReportInterpretation(ctx, { generationId: fx.aiB.interpretation.id, title: "X", body: "X" }),
  },
  "ai.resolveGeneration": {
    kind: "project",
    own: (ctx, fx) => ai.resolveGeneration(ctx, { generationId: fx.aiA.ideas.id, status: "used" }),
    foreign: (ctx, fx) => ai.resolveGeneration(ctx, { generationId: fx.aiB.ideas.id, status: "discarded" }),
  },

  // --- metrics ---
  "metrics.listMetricCatalog": {
    kind: "project",
    own: (ctx) => metrics.listMetricCatalog(ctx),
    foreign: { none: "Catálogo global sin datos de clientes" },
  },
  "metrics.adminListMetricDefinitions": { kind: "admin", call: (a) => metrics.adminListMetricDefinitions(a) },
  "metrics.adminCreateMetricDefinition": {
    kind: "admin",
    // El catálogo no se vacía entre pruebas: clave única en cada llamada.
    call: (a) =>
      metrics.adminCreateMetricDefinition(a, {
        key: `social.test_${crypto.randomUUID().slice(0, 8)}`,
        unit: "count",
        label: "Prueba",
        description: "Métrica de prueba",
        defaultAggregation: "sum",
      }),
  },
  "metrics.adminUpdateMetricDefinition": {
    kind: "admin",
    // Reescribe la definición con sus mismos valores (no altera el catálogo).
    call: async (a) => {
      const d = (await findDefinition("social.reach"))!;
      return metrics.adminUpdateMetricDefinition(a, {
        key: d.key,
        isActive: d.isActive,
        label: d.label,
        description: d.description,
        sourceNote: d.sourceNote ?? undefined,
        defaultAggregation: d.defaultAggregation,
        position: d.position,
      });
    },
  },
  "metrics.getCycleMetrics": {
    kind: "project",
    own: (ctx, fx) => metrics.getCycleMetrics(ctx, fx.contentA.cycle.id),
    foreign: (ctx, fx) => metrics.getCycleMetrics(ctx, fx.contentB.cycle.id),
  },
  "metrics.recordMetricValue": {
    kind: "project",
    own: (ctx, fx) =>
      metrics.recordMetricValue(ctx, { cycleId: fx.contentA.cycle.id, channelId: fx.channelA.id, metricKey: "social.reach", value: "900" }),
    // Ciclo propio + canal ajeno, y ciclo ajeno + canal propio.
    foreign: async (ctx, fx) => {
      await expectNotFound(
        metrics.recordMetricValue(ctx, { cycleId: fx.contentA.cycle.id, channelId: fx.channelB.id, metricKey: "social.reach", value: "1" }),
      );
      return metrics.recordMetricValue(ctx, { cycleId: fx.contentB.cycle.id, channelId: fx.channelA.id, metricKey: "social.reach", value: "1" });
    },
  },
  "metrics.uploadMetricCsv": {
    kind: "project",
    own: (ctx, fx) =>
      metrics.uploadMetricCsv(ctx, { cycleId: fx.contentA.cycle.id, channelId: fx.channelA.id, filename: "a.csv", text: "Alcance\n10\n" }),
    foreign: (ctx, fx) =>
      metrics.uploadMetricCsv(ctx, { cycleId: fx.contentA.cycle.id, channelId: fx.channelB.id, filename: "b.csv", text: "Alcance\n10\n" }),
  },
  "metrics.getMetricImport": {
    kind: "project",
    own: (ctx, fx) => metrics.getMetricImport(ctx, fx.metricsA.csvImport.id),
    foreign: (ctx, fx) => metrics.getMetricImport(ctx, fx.metricsB.csvImport.id),
  },
  "metrics.applyMetricImport": {
    kind: "project",
    own: (ctx, fx) =>
      metrics.applyMetricImport(ctx, {
        importId: fx.metricsA.csvImport.id,
        numberFormat: "es",
        mappings: [{ metricKey: "social.reach", column: 1, aggregation: "sum" }],
      }),
    foreign: (ctx, fx) =>
      metrics.applyMetricImport(ctx, {
        importId: fx.metricsB.csvImport.id,
        numberFormat: "es",
        mappings: [{ metricKey: "social.reach", column: 1, aggregation: "sum" }],
      }),
  },
  "metrics.discardMetricImport": {
    kind: "project",
    own: (ctx, fx) => metrics.discardMetricImport(ctx, { importId: fx.metricsA.csvImport.id }),
    foreign: (ctx, fx) => metrics.discardMetricImport(ctx, { importId: fx.metricsB.csvImport.id }),
  },
  "metrics.getMetricSummary": {
    kind: "project",
    own: (ctx, fx) => metrics.getMetricSummary(ctx, { cycleId: fx.contentA.cycle.id }),
    foreign: async (ctx, fx) => {
      await expectNotFound(metrics.getMetricSummary(ctx, { cycleId: fx.contentA.cycle.id, channelId: fx.channelB.id }));
      return metrics.getMetricSummary(ctx, { cycleId: fx.contentB.cycle.id });
    },
  },

  // --- reports ---
  "reports.getReport": {
    kind: "project",
    own: (ctx, fx) => reports.getReport(ctx, fx.contentA.cycle.id),
    foreign: (ctx, fx) => reports.getReport(ctx, fx.contentB.cycle.id),
  },
  "reports.getReportView": {
    kind: "project",
    own: (ctx, fx) => reports.getReportView(ctx, fx.contentA.cycle.id),
    foreign: (ctx, fx) => reports.getReportView(ctx, fx.contentB.cycle.id),
  },
  "reports.createReport": {
    kind: "project",
    own: async (ctx) => reports.createReport(ctx, { cycleId: (await cycles.openCycle(ctx, { period: "2026-11" })).id }),
    foreign: (ctx, fx) => reports.createReport(ctx, { cycleId: fx.contentB.cycle.id }),
  },
  "reports.addReportSection": {
    kind: "project",
    own: (ctx, fx) =>
      reports.addReportSection(ctx, { reportId: fx.metricsA.report.id, kind: "data", title: "IG", channelId: fx.channelA.id }),
    foreign: async (ctx, fx) => {
      await expectNotFound(
        reports.addReportSection(ctx, { reportId: fx.metricsA.report.id, kind: "data", title: "X", channelId: fx.channelB.id }),
      );
      return reports.addReportSection(ctx, { reportId: fx.metricsB.report.id, kind: "human_analysis", title: "X", body: "X" });
    },
  },
  "reports.updateReportSection": {
    kind: "project",
    own: (ctx, fx) => reports.updateReportSection(ctx, { sectionId: fx.metricsA.sections[0].id, title: "Resumen", body: "Bien" }),
    foreign: async (ctx, fx) => {
      const dataA = fx.metricsA.sections.find((s) => s.kind === "data")!;
      await expectNotFound(reports.updateReportSection(ctx, { sectionId: dataA.id, title: "X", channelId: fx.channelB.id }));
      return reports.updateReportSection(ctx, { sectionId: fx.metricsB.sections[0].id, title: "X", body: "X" });
    },
  },
  "reports.deleteReportSection": {
    kind: "project",
    own: (ctx, fx) => reports.deleteReportSection(ctx, { sectionId: fx.metricsA.sections[0].id }),
    foreign: (ctx, fx) => reports.deleteReportSection(ctx, { sectionId: fx.metricsB.sections[0].id }),
  },
  "reports.moveReportSection": {
    kind: "project",
    own: (ctx, fx) => reports.moveReportSection(ctx, { sectionId: fx.metricsA.sections[0].id, direction: "down" }),
    foreign: (ctx, fx) => reports.moveReportSection(ctx, { sectionId: fx.metricsB.sections[0].id, direction: "down" }),
  },
  "reports.addAiInterpretationSection": {
    kind: "project",
    own: (ctx, fx) =>
      reports.addAiInterpretationSection(ctx, {
        cycleId: fx.contentA.cycle.id,
        aiGenerationId: fx.aiA.interpretation.id,
        title: "Lectura",
        body: "Texto",
      }),
    // Ciclo propio + generación ajena (la FK compuesta lo impide), y ciclo ajeno.
    foreign: async (ctx, fx) => {
      await expectNotFound(
        reports.addAiInterpretationSection(ctx, {
          cycleId: fx.contentA.cycle.id,
          aiGenerationId: fx.aiB.interpretation.id,
          title: "X",
          body: "X",
        }),
      );
      return reports.addAiInterpretationSection(ctx, {
        cycleId: fx.contentB.cycle.id,
        aiGenerationId: fx.aiA.interpretation.id,
        title: "X",
        body: "X",
      });
    },
  },
  "reports.markAiSectionReviewed": {
    kind: "project",
    own: (ctx, fx) => reports.markAiSectionReviewed(ctx, { sectionId: fx.aiA.aiSection.id }),
    foreign: (ctx, fx) => reports.markAiSectionReviewed(ctx, { sectionId: fx.aiB.aiSection.id }),
  },
  "reports.approveReport": {
    kind: "project",
    own: (ctx, fx) => approveReportA(ctx, fx),
    foreign: (ctx, fx) => reports.approveReport(ctx, { reportId: fx.metricsB.report.id }),
  },
  "reports.reopenReport": {
    kind: "project",
    own: async (ctx, fx) => {
      await approveReportA(ctx, fx);
      return reports.reopenReport(ctx, { reportId: fx.metricsA.report.id, reason: "Cambiar resumen" });
    },
    foreign: (ctx, fx) => reports.reopenReport(ctx, { reportId: fx.metricsB.report.id, reason: "Intruso" }),
  },
};

/** Completa el análisis pendiente del informe de A, revisa lo de la IA y lo aprueba. */
async function approveReportA(ctx: ProjectContext, fx: Fixture) {
  for (const s of fx.metricsA.sections.filter((x) => x.kind === "human_analysis")) {
    await reports.updateReportSection(ctx, { sectionId: s.id, title: s.title, body: "Análisis del equipo" });
  }
  await reports.markAiSectionReviewed(ctx, { sectionId: fx.aiA.aiSection.id });
  return reports.approveReport(ctx, { reportId: fx.metricsA.report.id });
}

/** Para casos foreign con varias variantes: las intermedias también deben dar NotFound. */
async function expectNotFound(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (err) {
    if (err instanceof NotFoundError) return;
    throw err;
  }
  throw new Error("Se esperaba NotFoundError");
}
