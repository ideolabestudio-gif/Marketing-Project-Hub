import type { ProjectContext } from "@/modules/access/context";
import * as access from "@/modules/access/service";
import * as content from "@/modules/content/service";
import * as cycles from "@/modules/cycles/service";
import type { Actor } from "@/modules/identity/actor";
import * as identity from "@/modules/identity/service";
import * as projects from "@/modules/projects/service";
import { FIXTURE_PERIOD, TINY_PNG, type Fixture } from "../fixtures/two-projects";

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
    own: (ctx) => projects.updateProjectSettings(ctx, { timezone: "Europe/Madrid", locale: "es-ES" }),
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

  // --- audit ---
  "audit.recordAudit": { kind: "internal", reason: "Solo escribe; lo usan los demás servicios" },
};
