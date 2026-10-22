/** Textos de la página de actividad para cada acción de auditoría (sin datos de BD). */
export const ACTION_LABELS: Record<string, string> = {
  "content_item.created": "Creó la pieza",
  "content_item.updated": "Cambió los datos de la pieza",
  "content_item.duplicated": "Duplicó una pieza",
  "content_item.cancelled": "Canceló la pieza",
  "content_item.reactivated": "Recuperó la pieza",
  "content_version.created": "Guardó una versión nueva",
  "content_version.asset_added": "Añadió un archivo o enlace",
  "content_version.asset_removed": "Quitó un archivo o enlace",
  "comment.created": "Comentó",
  "review.submitted": "Envió a revisión",
  "review.internal_approved": "Aprobó (revisión interna)",
  "review.internal_changes_requested": "Pidió cambios (revisión interna)",
  "review.solo_approved": "Aprobó (trabajo en solitario)",
  "review.client_approved": "Registró la aprobación del cliente",
  "review.client_changes_requested": "Registró que el cliente pide cambios",
  "publication.scheduled": "Registró la programación",
  "publication.published": "Registró la publicación",
  "publication.cancelled": "Anuló la programación",
  "cycle.opened": "Abrió el mes",
  "cycle.brief_updated": "Cambió el brief",
  "cycle.status_changed": "Cambió la fase del mes",
  "cycle.closed": "Cerró el mes",
  "cycle.reopened": "Reabrió el mes",
  "cycle.deleted": "Eliminó el mes",
  "metric_value.recorded": "Registró una métrica a mano",
  "metric_value.corrected": "Corrigió una métrica",
  "metric_import.uploaded": "Subió un CSV de métricas",
  "metric_import.applied": "Aplicó una importación de métricas",
  "metric_import.discarded": "Descartó una importación de métricas",
  "report.created": "Creó el informe",
  "report.section_added": "Añadió una sección al informe",
  "report.section_updated": "Editó una sección del informe",
  "report.section_deleted": "Eliminó una sección del informe",
  "report.highlight_added": "Destacó una cifra",
  "report.highlight_removed": "Quitó una cifra destacada",
  "report.ai_section_added": "Añadió la lectura de Claude al informe",
  "report.ai_section_reviewed": "Revisó la lectura de Claude",
  "report.approved": "Aprobó el informe",
  "report.reopened": "Reabrió el informe",
  "ai.generated": "Pidió un borrador a la IA",
  "ai.failed": "Falló una petición a la IA",
  "ai.imported": "Pegó una respuesta de Claude",
  "ai.used": "Usó una propuesta de Claude",
  "ai.discarded": "Descartó una propuesta de Claude",
  "project.created": "Creó el proyecto",
  "project.settings_updated": "Cambió los ajustes",
  "project.ai_settings_updated": "Cambió los ajustes de IA",
  "project.links_updated": "Cambió los enlaces",
  "project.archived": "Archivó el proyecto",
  "project.reactivated": "Reactivó el proyecto",
  "project.exported": "Descargó el proyecto",
  "channel.created": "Añadió un canal",
  "channel.activated": "Activó un canal",
  "channel.deactivated": "Desactivó un canal",
  "brand_profile.saved": "Guardó la ficha del cliente",
  "library_item.added": "Añadió material a la biblioteca",
  "library_item.removed": "Quitó material de la biblioteca",
  "membership.set": "Cambió el equipo",
  "membership.removed": "Retiró a alguien del equipo",
  "access.denied": "Intentó algo sin permiso",
};

const REASONS: Record<string, string> = {
  missing_permission: "su rol no lo permite",
  project_archived: "el proyecto está archivado",
};

const STATUS_LABELS: Record<string, string> = {
  planning: "planificación",
  production: "producción",
  review: "revisión",
  publishing: "publicación",
  reporting: "informe",
  closed: "cerrado",
};

/** Detalle corto a partir de los datos del evento (solo campos conocidos y sin contenido largo). */
export function activityDetail(action: string, data: Record<string, unknown> | null): string | null {
  if (!data) return null;
  const str = (k: string) => (typeof data[k] === "string" ? (data[k] as string) : null);
  switch (action) {
    case "cycle.reopened":
    case "report.reopened":
      return str("reason") && `Motivo: ${str("reason")}`;
    case "access.denied":
      return [str("permission") && `Permiso: ${str("permission")}`, REASONS[str("reason") ?? ""]].filter(Boolean).join(" · ") || null;
    case "cycle.deleted":
      return str("period");
    case "cycle.status_changed":
      return `${STATUS_LABELS[str("from") ?? ""] ?? str("from")} → ${STATUS_LABELS[str("to") ?? ""] ?? str("to")}`;
    case "metric_import.uploaded":
      return str("filename");
    case "report.section_deleted":
      return str("title");
    default:
      return typeof data.versionNo === "number" ? `v${data.versionNo}` : null;
  }
}
