import { z } from "zod";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { wallTimeToUtc } from "@/lib/time";
import { isUuid, parseInput } from "@/lib/validation";
import { authorize, hasPermission, requireProjectAccess, type ProjectContext } from "@/modules/access/context";
import { listMyProjects } from "@/modules/access/service";
import { recordAudit } from "@/modules/audit/service";
import { assertCycleWritable, getCycle } from "@/modules/cycles/service";
import type { Actor } from "@/modules/identity/actor";
import {
  deriveVersionState,
  effectiveStatus,
  LOCKED_STATUSES,
  type ReviewEvent,
  type WorkflowStatus,
} from "./domain";
import * as repo from "./repo";

// Ninguna función de este módulo publica ni envía nada fuera del Hub: solo registra
// lo que una persona ha hecho a mano en Metricool/MailerLite (principio RE-05).

// ---------------------------------------------------------------------------
// Estado
// ---------------------------------------------------------------------------

async function loadItem(ctx: ProjectContext, itemId: string) {
  const item = isUuid(itemId) ? await repo.findItemWithLatestVersion(ctx, itemId) : undefined;
  if (!item) throw new NotFoundError();
  return item;
}

async function computeItemState(ctx: ProjectContext, itemId: string) {
  const [item, flags, approvals, active] = await Promise.all([
    loadItem(ctx, itemId),
    repo.getProjectFlags(ctx),
    repo.listApprovalsForItem(ctx, itemId),
    repo.findActivePublication(ctx, itemId),
  ]);
  const currentEvents: ReviewEvent[] = item.latest
    ? approvals.filter((a) => a.contentVersionId === item.latest!.id)
    : [];
  const versionState = deriveVersionState(currentEvents, flags.requireClientApproval);
  const status = effectiveStatus({
    cancelled: item.baseStatus === "cancelled",
    hasVersion: Boolean(item.latest),
    versionState,
    activePublication: active ? (active.status as "scheduled" | "published") : null,
  });
  return { item, flags, approvals, active: active ?? null, versionState, status };
}

/** Estado de revisión y publicación de una pieza, con el historial completo. */
export async function getItemReview(ctx: ProjectContext, itemId: string) {
  await authorize(ctx, "project.read");
  const state = await computeItemState(ctx, itemId);
  const publications = await repo.listPublicationsForItem(ctx, itemId);
  return {
    status: state.status,
    versionState: state.versionState,
    latestVersion: state.item.latest,
    requireClientApproval: state.flags.requireClientApproval,
    separationOfDuties: state.flags.separationOfDuties,
    isAuthorOfLatest: state.item.latest?.createdBy === ctx.actor.userId,
    events: state.approvals,
    activePublication: state.active,
    publications,
  };
}

function statusesFrom(rows: Awaited<ReturnType<typeof repo.listWorkflowRows>>, requireClient: boolean) {
  const latestByItem = new Map(rows.latestVersions.map((v) => [v.itemId, v]));
  const eventsByVersion = new Map<string, ReviewEvent[]>();
  for (const e of rows.events) eventsByVersion.set(e.versionId, [...(eventsByVersion.get(e.versionId) ?? []), e]);
  const activeByItem = new Map(rows.activePublications.map((p) => [p.itemId, p]));
  return rows.items.map((item) => {
    const latest = latestByItem.get(item.id);
    const active = activeByItem.get(item.id);
    const status = effectiveStatus({
      cancelled: item.baseStatus === "cancelled",
      hasVersion: Boolean(latest),
      versionState: deriveVersionState(latest ? (eventsByVersion.get(latest.versionId) ?? []) : [], requireClient),
      activePublication: active ? (active.status as "scheduled" | "published") : null,
    });
    return { ...item, status, latestAuthorId: latest?.createdBy ?? null, scheduledAt: active?.scheduledAt ?? null };
  });
}

/** Estado de todas las piezas de un ciclo (para el calendario y la lista). */
export async function listCycleStatuses(ctx: ProjectContext, cycleId: string): Promise<Record<string, WorkflowStatus>> {
  await authorize(ctx, "project.read");
  const cycle = await getCycle(ctx, cycleId);
  const [rows, flags] = await Promise.all([repo.listWorkflowRows(ctx, { cycleId: cycle.id }), repo.getProjectFlags(ctx)]);
  return Object.fromEntries(statusesFrom(rows, flags.requireClientApproval).map((r) => [r.id, r.status]));
}

/** Lo programado y publicado en el ciclo (para el informe). Datos del propio Hub. */
export async function listCyclePublications(ctx: ProjectContext, cycleId: string) {
  await authorize(ctx, "project.read");
  const cycle = await getCycle(ctx, cycleId);
  return repo.listActivePublicationsForCycle(ctx, cycle.id);
}

/**
 * Lanza un error si el contenido de la pieza no se puede modificar porque ya está
 * programada o publicada. La usa el módulo de contenidos antes de cualquier cambio.
 */
export async function assertContentEditable(ctx: ProjectContext, itemId: string): Promise<void> {
  const active = await repo.findActivePublication(ctx, itemId);
  if (active) {
    throw new ValidationError(
      active.status === "published"
        ? "La pieza ya está publicada: no se puede modificar"
        : "La pieza está programada: cancela la programación antes de modificarla",
    );
  }
}

// ---------------------------------------------------------------------------
// Revisión
// ---------------------------------------------------------------------------

const commentSchema = z.string().trim().max(2000).optional().transform((v) => v || null);

/** Comprueba que la versión que vio la persona sigue siendo la última. */
function assertLatest(state: Awaited<ReturnType<typeof computeItemState>>, versionId: string) {
  if (!state.item.latest) throw new ValidationError("La pieza no tiene contenido todavía");
  if (state.item.latest.id !== versionId) {
    throw new ConflictError("La pieza ha cambiado (hay una versión nueva). Recarga la página.");
  }
  return state.item.latest;
}

async function assertWritableCycle(ctx: ProjectContext, cycleId: string) {
  assertCycleWritable(await getCycle(ctx, cycleId));
}

const submitSchema = z.object({ itemId: z.string(), versionId: z.string(), comment: commentSchema });

export async function submitForReview(ctx: ProjectContext, input: z.input<typeof submitSchema>) {
  await authorize(ctx, "content.write");
  const data = parseInput(submitSchema, input);
  const state = await computeItemState(ctx, data.itemId);
  await assertWritableCycle(ctx, state.item.cycleId);
  const latest = assertLatest(state, data.versionId);
  if (state.status !== "draft") throw new ValidationError("Solo se puede enviar a revisión una pieza en borrador");
  const row = await repo.insertApproval(ctx, {
    contentItemId: state.item.id,
    contentVersionId: latest.id,
    stage: "submission",
    decision: "submitted",
    clientApproverName: null,
    evidence: null,
    comment: data.comment,
  });
  await audit(ctx, "review.submitted", row.id, { itemId: state.item.id, versionNo: latest.versionNo });
}

const decisionSchema = z.enum(["approved", "changes_requested"], "Decisión no válida");

const internalSchema = z.object({
  itemId: z.string(),
  versionId: z.string(),
  decision: decisionSchema,
  comment: commentSchema,
});

export async function decideInternal(ctx: ProjectContext, input: z.input<typeof internalSchema>) {
  await authorize(ctx, "approval.internal");
  const data = parseInput(internalSchema, input);
  const state = await computeItemState(ctx, data.itemId);
  await assertWritableCycle(ctx, state.item.cycleId);
  const latest = assertLatest(state, data.versionId);
  if (state.status !== "in_review") throw new ValidationError("La pieza no está pendiente de revisión interna");
  if (state.flags.separationOfDuties && latest.createdBy === ctx.actor.userId) {
    throw new ForbiddenError("No puedes aprobar una versión que has escrito tú (separación de funciones)");
  }
  if (data.decision === "changes_requested" && !data.comment) {
    throw new ValidationError("Explica qué cambios hacen falta");
  }
  const row = await repo.insertApproval(ctx, {
    contentItemId: state.item.id,
    contentVersionId: latest.id,
    stage: "internal",
    decision: data.decision,
    clientApproverName: null,
    evidence: null,
    comment: data.comment,
  });
  await audit(ctx, `review.internal_${data.decision}`, row.id, { itemId: state.item.id, versionNo: latest.versionNo });
}

const clientSchema = z.object({
  itemId: z.string(),
  versionId: z.string(),
  decision: decisionSchema,
  approverName: z.string().trim().min(1, "Indica quién respondió en el cliente").max(200),
  evidence: z
    .string()
    .trim()
    .min(5, "Describe la evidencia (p. ej. «Email de Marta, 3/11 10:15: OK»)")
    .max(2000),
  comment: commentSchema,
});

/** Registra la respuesta del cliente (que no entra en el Hub) con su evidencia. */
export async function recordClientDecision(ctx: ProjectContext, input: z.input<typeof clientSchema>) {
  await authorize(ctx, "approval.client.record");
  const data = parseInput(clientSchema, input);
  const state = await computeItemState(ctx, data.itemId);
  await assertWritableCycle(ctx, state.item.cycleId);
  const latest = assertLatest(state, data.versionId);
  if (!state.flags.requireClientApproval) throw new ValidationError("Este proyecto no exige aprobación del cliente");
  if (state.status !== "awaiting_client") {
    throw new ValidationError("La pieza no está pendiente del cliente (primero hace falta la aprobación interna)");
  }
  const row = await repo.insertApproval(ctx, {
    contentItemId: state.item.id,
    contentVersionId: latest.id,
    stage: "client",
    decision: data.decision,
    clientApproverName: data.approverName,
    evidence: data.evidence,
    comment: data.comment,
  });
  await audit(ctx, `review.client_${data.decision}`, row.id, { itemId: state.item.id, versionNo: latest.versionNo });
}

// ---------------------------------------------------------------------------
// Publicación (registro manual)
// ---------------------------------------------------------------------------

const httpUrl = z
  .string()
  .trim()
  .optional()
  .transform((v) => v || null)
  .pipe(
    z
      .url("Enlace no válido")
      .refine((u) => /^https?:\/\//i.test(u), "El enlace debe empezar por http:// o https://")
      .nullable(),
  );

async function toUtc(ctx: ProjectContext, wall: string): Promise<Date> {
  const flags = await repo.getProjectFlags(ctx);
  const date = wallTimeToUtc(wall, flags.timezone);
  if (!date) throw new ValidationError("Fecha no válida");
  return date;
}

const publicationSchema = z.object({
  itemId: z.string(),
  versionId: z.string(),
  status: z.enum(["scheduled", "published"], "Indica si está programada o publicada"),
  at: z.string().trim().min(1, "Indica la fecha y hora"),
  externalUrl: httpUrl,
  externalId: z.string().trim().max(200).optional().transform((v) => v || null),
  note: commentSchema,
});

/**
 * Registra que una persona ha programado o publicado la versión aprobada en la
 * herramienta externa. La BD vuelve a comprobar las aprobaciones (trigger).
 */
export async function recordPublication(ctx: ProjectContext, input: z.input<typeof publicationSchema>) {
  await authorize(ctx, "publish");
  const data = parseInput(publicationSchema, input);
  const state = await computeItemState(ctx, data.itemId);
  await assertWritableCycle(ctx, state.item.cycleId);
  const latest = assertLatest(state, data.versionId);
  if (state.status !== "approved") {
    throw new ValidationError("Solo se puede registrar la publicación de una pieza aprobada");
  }
  const at = await toUtc(ctx, data.at);
  const row = await repo.insertPublication(ctx, {
    contentItemId: state.item.id,
    contentVersionId: latest.id,
    status: data.status,
    scheduledAt: data.status === "scheduled" ? at : null,
    publishedAt: data.status === "published" ? at : null,
    externalUrl: data.externalUrl,
    externalId: data.externalId,
    note: data.note,
  });
  await audit(ctx, `publication.${data.status}`, row.id, { itemId: state.item.id, versionNo: latest.versionNo });
  return row;
}

async function loadActivePublication(ctx: ProjectContext, publicationId: string) {
  const publication = isUuid(publicationId) ? await repo.findPublication(ctx, publicationId) : undefined;
  if (!publication) throw new NotFoundError();
  return publication;
}

const markPublishedSchema = z.object({
  publicationId: z.string(),
  at: z.string().trim().min(1, "Indica la fecha y hora de publicación"),
  externalUrl: httpUrl,
  externalId: z.string().trim().max(200).optional().transform((v) => v || null),
});

/** Confirma que una publicación programada ya ha salido. */
export async function markPublished(ctx: ProjectContext, input: z.input<typeof markPublishedSchema>) {
  await authorize(ctx, "publish");
  const data = parseInput(markPublishedSchema, input);
  const publication = await loadActivePublication(ctx, data.publicationId);
  if (publication.status !== "scheduled") throw new ValidationError("Solo se puede confirmar una publicación programada");
  await repo.updatePublication(ctx, publication.id, {
    status: "published",
    publishedAt: await toUtc(ctx, data.at),
    externalUrl: data.externalUrl ?? publication.externalUrl,
    externalId: data.externalId ?? publication.externalId,
  });
  await audit(ctx, "publication.published", publication.id, { itemId: publication.contentItemId });
}

const cancelSchema = z.object({
  publicationId: z.string(),
  reason: z.string().trim().min(3, "Indica el motivo").max(500),
});

/** Cancela una programación (p. ej. para corregir algo). La pieza vuelve a "aprobada". */
export async function cancelPublication(ctx: ProjectContext, input: z.input<typeof cancelSchema>) {
  await authorize(ctx, "publish");
  const data = parseInput(cancelSchema, input);
  const publication = await loadActivePublication(ctx, data.publicationId);
  if (publication.status !== "scheduled") throw new ValidationError("Solo se puede cancelar una publicación programada");
  await repo.updatePublication(ctx, publication.id, {
    status: "cancelled",
    cancelledAt: new Date(),
    cancelledBy: ctx.actor.userId,
    note: publication.note ? `${publication.note}\nCancelada: ${data.reason}` : `Cancelada: ${data.reason}`,
  });
  await audit(ctx, "publication.cancelled", publication.id, { itemId: publication.contentItemId, reason: data.reason });
}

// ---------------------------------------------------------------------------
// Panel "Pendiente de mí"
// ---------------------------------------------------------------------------

export type PendingAction = "review" | "client" | "fix" | "publish" | "confirm";

export const PENDING_ACTION_LABELS: Record<PendingAction, string> = {
  review: "Revisar y aprobar",
  client: "Registrar respuesta del cliente",
  fix: "Aplicar los cambios pedidos",
  publish: "Publicar o programar y registrarlo",
  confirm: "Confirmar que se ha publicado",
};

/**
 * Lo que el usuario puede hacer ahora en todos sus proyectos. Cada proyecto se
 * consulta con su propio contexto autorizado: no hay consultas entre proyectos.
 */
export async function listMyPendingWork(actor: Actor, now = new Date()) {
  const memberships = await listMyProjects(actor);
  const result: {
    projectId: string;
    projectName: string;
    clientName: string;
    itemId: string;
    title: string;
    period: string;
    plannedAt: Date | null;
    timezone: string;
    status: WorkflowStatus;
    action: PendingAction;
  }[] = [];
  for (const m of memberships) {
    if (m.projectStatus === "archived") continue;
    const ctx = await requireProjectAccess(actor, m.projectId);
    const [rows, flags] = await Promise.all([repo.listWorkflowRows(ctx), repo.getProjectFlags(ctx)]);
    for (const row of statusesFrom(rows, flags.requireClientApproval)) {
      let action: PendingAction | null = null;
      if (row.status === "in_review" && hasPermission(ctx, "approval.internal")) {
        if (!(flags.separationOfDuties && row.latestAuthorId === actor.userId)) action = "review";
      } else if (row.status === "awaiting_client" && hasPermission(ctx, "approval.client.record")) action = "client";
      else if (row.status === "changes_requested" && hasPermission(ctx, "content.write")) action = "fix";
      else if (row.status === "approved" && hasPermission(ctx, "publish")) action = "publish";
      else if (row.status === "scheduled" && row.scheduledAt && row.scheduledAt <= now && hasPermission(ctx, "publish")) {
        action = "confirm";
      }
      if (!action) continue;
      result.push({
        projectId: m.projectId,
        projectName: m.projectName,
        clientName: m.clientName,
        itemId: row.id,
        title: row.title,
        period: row.period,
        plannedAt: row.plannedAt,
        timezone: flags.timezone,
        status: row.status,
        action,
      });
    }
  }
  return result.sort((a, b) => (a.plannedAt?.getTime() ?? Infinity) - (b.plannedAt?.getTime() ?? Infinity));
}

export function isLocked(status: WorkflowStatus): boolean {
  return LOCKED_STATUSES.includes(status);
}

async function audit(ctx: ProjectContext, action: string, entityId: string, data: Record<string, unknown>) {
  await recordAudit({
    action,
    actorId: ctx.actor.userId,
    projectId: ctx.projectId,
    entityType: action.startsWith("publication") ? "publication" : "approval",
    entityId,
    data,
  });
}
