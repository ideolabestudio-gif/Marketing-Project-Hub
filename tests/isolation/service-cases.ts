import type { ProjectContext } from "@/modules/access/context";
import * as access from "@/modules/access/service";
import type { Actor } from "@/modules/identity/actor";
import * as identity from "@/modules/identity/service";
import * as projects from "@/modules/projects/service";
import type { Fixture } from "../fixtures/two-projects";

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

  // --- audit ---
  "audit.recordAudit": { kind: "internal", reason: "Solo escribe; lo usan los demás servicios" },
};
