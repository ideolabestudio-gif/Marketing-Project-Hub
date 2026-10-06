import { z } from "zod";
import { ConflictError, NotFoundError } from "@/lib/errors";
import { isUniqueViolation, isUuid, isValidTimezone, parseInput } from "@/lib/validation";
import { authorize, type ProjectContext } from "@/modules/access/context";
import { recordAudit } from "@/modules/audit/service";
import { assertAdmin, type Actor } from "@/modules/identity/actor";
import { PLATFORM_KEYS, PLATFORMS } from "./catalog";
import * as repo from "./repo";

const timezoneSchema = z.string().trim().refine(isValidTimezone, "Zona horaria no válida");
const localeSchema = z.string().trim().regex(/^[a-z]{2}(-[A-Z]{2})?$/, "Idioma no válido (p. ej. es-ES)");

// ---------------------------------------------------------------------------
// Proyecto (con contexto)
// ---------------------------------------------------------------------------

export async function getProject(ctx: ProjectContext) {
  await authorize(ctx, "project.read");
  const project = await repo.getProjectWithClient(ctx);
  if (!project) throw new NotFoundError();
  return project;
}

const settingsSchema = z.object({
  timezone: timezoneSchema,
  locale: localeSchema,
  requireClientApproval: z.boolean(),
  separationOfDuties: z.boolean(),
});

export async function updateProjectSettings(ctx: ProjectContext, input: z.input<typeof settingsSchema>) {
  await authorize(ctx, "project.settings");
  const data = parseInput(settingsSchema, input);
  await repo.updateProject(ctx, data);
  await recordAudit({
    action: "project.settings_updated",
    actorId: ctx.actor.userId,
    projectId: ctx.projectId,
    entityType: "project",
    entityId: ctx.projectId,
    data,
  });
}

export async function listChannels(ctx: ProjectContext) {
  await authorize(ctx, "project.read");
  return repo.listChannels(ctx);
}

const channelSchema = z.object({
  platform: z.enum(PLATFORM_KEYS, "Plataforma no válida"),
  displayName: z.string().trim().min(1, "Indica un nombre").max(120),
  handle: z.string().trim().max(200).optional(),
});

export async function createChannel(ctx: ProjectContext, input: z.input<typeof channelSchema>) {
  await authorize(ctx, "project.settings");
  const data = parseInput(channelSchema, input);
  const channel = await repo.insertChannel(ctx, {
    platform: data.platform,
    kind: PLATFORMS[data.platform].kind,
    displayName: data.displayName,
    handle: data.handle || null,
    mode: "manual",
  });
  await recordAudit({
    action: "channel.created",
    actorId: ctx.actor.userId,
    projectId: ctx.projectId,
    entityType: "channel",
    entityId: channel.id,
    data: { platform: data.platform },
  });
  return channel;
}

export async function setChannelActive(ctx: ProjectContext, input: { channelId: string; active: boolean }) {
  await authorize(ctx, "project.settings");
  if (!isUuid(input.channelId)) throw new NotFoundError();
  const updated = await repo.updateChannelActive(ctx, input.channelId, input.active);
  if (!updated) throw new NotFoundError();
  await recordAudit({
    action: input.active ? "channel.activated" : "channel.deactivated",
    actorId: ctx.actor.userId,
    projectId: ctx.projectId,
    entityType: "channel",
    entityId: input.channelId,
  });
}

// ---------------------------------------------------------------------------
// Administración: clientes y proyectos (solo estructura, nunca contenidos)
// ---------------------------------------------------------------------------

export async function adminListClients(actor: Actor) {
  assertAdmin(actor);
  return repo.listClients();
}

const clientSchema = z.object({
  name: z.string().trim().min(1, "Indica un nombre").max(120),
  notes: z.string().trim().max(2000).optional(),
});

export async function adminCreateClient(actor: Actor, input: z.input<typeof clientSchema>) {
  assertAdmin(actor);
  const data = parseInput(clientSchema, input);
  try {
    const client = await repo.insertClient({ name: data.name, notes: data.notes || null });
    await recordAudit({ action: "client.created", actorId: actor.userId, entityType: "client", entityId: client.id });
    return client;
  } catch (err) {
    if (isUniqueViolation(err)) throw new ConflictError("Ya existe un cliente con ese nombre");
    throw err;
  }
}

export async function adminListProjects(actor: Actor) {
  assertAdmin(actor);
  return repo.listProjectsWithClient();
}

export async function adminGetProject(actor: Actor, projectId: string) {
  assertAdmin(actor);
  if (!isUuid(projectId)) throw new NotFoundError();
  const project = await repo.findProjectWithClient(projectId);
  if (!project) throw new NotFoundError();
  return project;
}

const projectSchema = z.object({
  clientId: z.uuid("Selecciona un cliente"),
  name: z.string().trim().min(1, "Indica un nombre").max(120),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Identificador: minúsculas, números y guiones")
    .max(60),
  timezone: timezoneSchema.default("Europe/Madrid"),
});

export async function adminCreateProject(actor: Actor, input: z.input<typeof projectSchema>) {
  assertAdmin(actor);
  const data = parseInput(projectSchema, input);
  if (!(await repo.findClient(data.clientId))) throw new NotFoundError("Cliente no encontrado");
  try {
    const project = await repo.insertProject(data);
    await recordAudit({
      action: "project.created",
      actorId: actor.userId,
      projectId: project.id,
      entityType: "project",
      entityId: project.id,
    });
    return project;
  } catch (err) {
    if (isUniqueViolation(err)) throw new ConflictError("Ese identificador ya existe para este cliente");
    throw err;
  }
}

export async function adminSetProjectStatus(
  actor: Actor,
  input: { projectId: string; status: "active" | "archived" },
) {
  assertAdmin(actor);
  if (!isUuid(input.projectId)) throw new NotFoundError();
  const status = z.enum(["active", "archived"]).parse(input.status);
  if (!(await repo.setProjectStatus(input.projectId, status))) throw new NotFoundError();
  await recordAudit({
    action: status === "archived" ? "project.archived" : "project.reactivated",
    actorId: actor.userId,
    projectId: input.projectId,
    entityType: "project",
    entityId: input.projectId,
  });
}
