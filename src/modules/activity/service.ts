import { isUuid } from "@/lib/validation";
import { authorize, type ProjectContext } from "@/modules/access/context";
import * as repo from "./repo";

/** Grupos del filtro de actividad: prefijos de las acciones de auditoría. */
export const ACTIVITY_GROUPS = {
  piezas: { label: "Piezas", prefixes: ["content_item.", "content_version.", "comment."] },
  revision: { label: "Revisión y cliente", prefixes: ["review."] },
  publicacion: { label: "Programación y publicación", prefixes: ["publication."] },
  mes: { label: "Meses", prefixes: ["cycle."] },
  metricas: { label: "Métricas", prefixes: ["metric_"] },
  informe: { label: "Informes", prefixes: ["report."] },
  claude: { label: "Claude", prefixes: ["ai."] },
  proyecto: { label: "Proyecto y equipo", prefixes: ["project.", "channel.", "brand_profile.", "library_item.", "membership.", "integration."] },
  accesos: { label: "Accesos denegados", prefixes: ["access."] },
} as const;
export type ActivityGroup = keyof typeof ACTIVITY_GROUPS;

const PAGE_SIZE = 100;

/**
 * Lo que ha pasado en el proyecto (quién aprobó, importó, reabrió o eliminó qué y cuándo),
 * del registro de auditoría. Solo lectura y solo la responsable del proyecto.
 * `before` es el cursor de la página anterior («<fecha ISO>_<id>»).
 */
export async function listProjectActivity(ctx: ProjectContext, input: { group?: string; before?: string }) {
  await authorize(ctx, "project.activity");
  const group = input.group && input.group in ACTIVITY_GROUPS ? (input.group as ActivityGroup) : null;
  const before = parseCursor(input.before);
  const rows = await repo.listEvents(ctx, {
    prefixes: group ? [...ACTIVITY_GROUPS[group].prefixes] : null,
    // Los accesos denegados son ruido en «Todo» (p. ej. un enlace viejo): solo en su filtro.
    exclude: group ? [] : [...ACTIVITY_GROUPS.accesos.prefixes],
    before,
    limit: PAGE_SIZE + 1,
  });
  const events = rows.slice(0, PAGE_SIZE);
  const last = events.at(-1);
  return {
    group,
    events,
    next: rows.length > PAGE_SIZE && last ? `${last.createdAt.toISOString()}_${last.id}` : null,
  };
}

function parseCursor(raw: string | undefined): { at: Date; id: string } | null {
  if (!raw) return null;
  const [iso, id] = raw.split("_");
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) || !isUuid(id ?? "") ? null : { at, id };
}
