/**
 * Reglas puras del flujo de revisión (sin E/S, fáciles de probar).
 *
 * El estado de una pieza NO se guarda: se deduce de hechos inmutables (envíos y
 * decisiones sobre su última versión, y publicaciones). Guardar una versión nueva
 * deja automáticamente la pieza en borrador: las aprobaciones eran de la anterior.
 */

export type ReviewEvent = {
  stage: "submission" | "internal" | "client";
  decision: "submitted" | "approved" | "changes_requested";
};

export type VersionReviewState = "draft" | "in_review" | "awaiting_client" | "changes_requested" | "approved";

export type WorkflowStatus =
  | "idea"
  | "draft"
  | "in_review"
  | "awaiting_client"
  | "changes_requested"
  | "approved"
  | "scheduled"
  | "published"
  | "cancelled";

/** Estado de revisión de UNA versión a partir de sus eventos. */
export function deriveVersionState(events: ReviewEvent[], requireClientApproval: boolean): VersionReviewState {
  if (events.some((e) => e.decision === "changes_requested")) return "changes_requested";
  if (!events.some((e) => e.stage === "submission")) return "draft";
  if (!events.some((e) => e.stage === "internal" && e.decision === "approved")) return "in_review";
  if (!requireClientApproval) return "approved";
  return events.some((e) => e.stage === "client" && e.decision === "approved") ? "approved" : "awaiting_client";
}

export function effectiveStatus(input: {
  cancelled: boolean;
  hasVersion: boolean;
  versionState: VersionReviewState;
  activePublication: "scheduled" | "published" | null;
}): WorkflowStatus {
  if (input.activePublication) return input.activePublication;
  if (input.cancelled) return "cancelled";
  if (!input.hasVersion) return "idea";
  return input.versionState;
}

export const WORKFLOW_LABELS: Record<WorkflowStatus, string> = {
  idea: "Idea",
  draft: "Borrador",
  in_review: "En revisión interna",
  awaiting_client: "Pendiente del cliente",
  changes_requested: "Cambios pedidos",
  approved: "Aprobada",
  scheduled: "Programada",
  published: "Publicada",
  cancelled: "Cancelada",
};

/** Estados en los que el contenido ya no se puede editar (lo publicado es lo aprobado). */
export const LOCKED_STATUSES: readonly WorkflowStatus[] = ["scheduled", "published"];
