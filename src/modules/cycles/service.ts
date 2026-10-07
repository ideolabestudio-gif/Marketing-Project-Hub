import { z } from "zod";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { isValidPeriod } from "@/lib/time";
import { isUniqueViolation, isUuid, parseInput } from "@/lib/validation";
import { authorize, type ProjectContext } from "@/modules/access/context";
import { recordAudit } from "@/modules/audit/service";
import * as repo from "./repo";

export type Cycle = repo.CycleRow;

/** Estados que se pueden elegir a mano en F2. El cierre llega en F4 (exige informe). */
export const SELECTABLE_STATUSES = ["planning", "production", "review", "publishing", "reporting"] as const;

export const CYCLE_STATUS_LABELS: Record<Cycle["status"], string> = {
  planning: "Planificación",
  production: "Producción",
  review: "Revisión",
  publishing: "Publicación",
  reporting: "Informe",
  closed: "Cerrado",
};

export async function listCycles(ctx: ProjectContext): Promise<Cycle[]> {
  await authorize(ctx, "project.read");
  return repo.listCycles(ctx);
}

export async function getCycle(ctx: ProjectContext, cycleId: string): Promise<Cycle> {
  await authorize(ctx, "project.read");
  const cycle = isUuid(cycleId) ? await repo.findCycleById(ctx, cycleId) : undefined;
  if (!cycle) throw new NotFoundError();
  return cycle;
}

export async function getCycleByPeriod(ctx: ProjectContext, period: string): Promise<Cycle> {
  await authorize(ctx, "project.read");
  const cycle = isValidPeriod(period) ? await repo.findCycleByPeriod(ctx, period) : undefined;
  if (!cycle) throw new NotFoundError();
  return cycle;
}

const openSchema = z.object({
  period: z.string().trim().refine(isValidPeriod, "Mes no válido (AAAA-MM)"),
});

export async function openCycle(ctx: ProjectContext, input: z.input<typeof openSchema>): Promise<Cycle> {
  await authorize(ctx, "cycle.manage");
  const { period } = parseInput(openSchema, input);
  try {
    const cycle = await repo.insertCycle(ctx, period);
    await recordAudit({
      action: "cycle.opened",
      actorId: ctx.actor.userId,
      projectId: ctx.projectId,
      entityType: "cycle",
      entityId: cycle.id,
      data: { period },
    });
    return cycle;
  } catch (err) {
    if (isUniqueViolation(err)) throw new ConflictError("Ese mes ya tiene un ciclo abierto");
    throw err;
  }
}

/** Lanza ForbiddenError si el ciclo está cerrado (solo lectura). La usan otros módulos. */
export function assertCycleWritable(cycle: Cycle): void {
  if (cycle.status === "closed") throw new ForbiddenError("El ciclo está cerrado (solo lectura)");
}

const briefSchema = z.object({
  cycleId: z.string(),
  objectives: z.string().trim().max(5000).optional(),
  keyDates: z.string().trim().max(5000).optional(),
  notes: z.string().trim().max(5000).optional(),
});

export async function updateCycleBrief(ctx: ProjectContext, input: z.input<typeof briefSchema>): Promise<void> {
  await authorize(ctx, "cycle.manage");
  const data = parseInput(briefSchema, input);
  const cycle = await getCycle(ctx, data.cycleId);
  assertCycleWritable(cycle);
  await repo.updateCycle(ctx, cycle.id, {
    objectives: data.objectives || null,
    keyDates: data.keyDates || null,
    notes: data.notes || null,
  });
  await recordAudit({
    action: "cycle.brief_updated",
    actorId: ctx.actor.userId,
    projectId: ctx.projectId,
    entityType: "cycle",
    entityId: cycle.id,
  });
}

const statusSchema = z.object({
  cycleId: z.string(),
  status: z.enum(SELECTABLE_STATUSES, "Estado no válido"),
});

export async function setCycleStatus(ctx: ProjectContext, input: z.input<typeof statusSchema>): Promise<void> {
  await authorize(ctx, "cycle.manage");
  const data = parseInput(statusSchema, input);
  const cycle = await getCycle(ctx, data.cycleId);
  assertCycleWritable(cycle);
  await repo.updateCycle(ctx, cycle.id, { status: data.status });
  await recordAudit({
    action: "cycle.status_changed",
    actorId: ctx.actor.userId,
    projectId: ctx.projectId,
    entityType: "cycle",
    entityId: cycle.id,
    data: { from: cycle.status, to: data.status },
  });
}

const closeSchema = z.object({
  cycleId: z.string(),
  learnings: z.string().trim().min(10, "Anota los aprendizajes del mes (al menos una frase)").max(5000),
});

/**
 * Cierra el ciclo: exige el informe aprobado (también lo exige un trigger de BD) y
 * deja todo el mes en solo lectura.
 */
export async function closeCycle(ctx: ProjectContext, input: z.input<typeof closeSchema>): Promise<void> {
  await authorize(ctx, "cycle.manage");
  const data = parseInput(closeSchema, input);
  const cycle = await getCycle(ctx, data.cycleId);
  assertCycleWritable(cycle);
  if (!(await repo.hasApprovedReport(ctx, cycle.id))) {
    throw new ValidationError("Para cerrar el ciclo, el informe del mes tiene que estar aprobado");
  }
  await repo.updateCycle(ctx, cycle.id, {
    status: "closed",
    learnings: data.learnings,
    closedAt: new Date(),
    closedBy: ctx.actor.userId,
  });
  await recordAudit({
    action: "cycle.closed",
    actorId: ctx.actor.userId,
    projectId: ctx.projectId,
    entityType: "cycle",
    entityId: cycle.id,
  });
}

const reopenSchema = z.object({
  cycleId: z.string(),
  reason: z.string().trim().min(3, "Indica el motivo").max(500),
});

/** Reabre un ciclo cerrado (queda auditado con su motivo). */
export async function reopenCycle(ctx: ProjectContext, input: z.input<typeof reopenSchema>): Promise<void> {
  await authorize(ctx, "cycle.manage");
  const data = parseInput(reopenSchema, input);
  const cycle = await getCycle(ctx, data.cycleId);
  if (cycle.status !== "closed") throw new ValidationError("El ciclo no está cerrado");
  await repo.updateCycle(ctx, cycle.id, { status: "reporting", closedAt: null, closedBy: null });
  await recordAudit({
    action: "cycle.reopened",
    actorId: ctx.actor.userId,
    projectId: ctx.projectId,
    entityType: "cycle",
    entityId: cycle.id,
    data: { reason: data.reason },
  });
}
