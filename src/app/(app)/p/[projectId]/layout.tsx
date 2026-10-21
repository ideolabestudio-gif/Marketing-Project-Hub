import Link from "next/link";
import { projectContextForPage } from "@/lib/project-page";
import { currentPeriod, formatPeriod } from "@/lib/time";
import { hasPermission } from "@/modules/access/context";
import { listCycles } from "@/modules/cycles/service";
import { getProject, METRICOOL_HOME_URL } from "@/modules/projects/service";
import { ProjectNav } from "./project-nav";

/**
 * Cabecera común de todas las páginas de un proyecto: cliente, nombre y pestañas
 * (Resumen, mes en curso, Ficha, Ajustes) para no tener que volver atrás para cambiar de sección.
 */
export default async function ProjectLayout({ params, children }: LayoutProps<"/p/[projectId]">) {
  const { projectId } = await params;
  const ctx = await projectContextForPage(projectId);
  const [project, cycles] = await Promise.all([getProject(ctx), listCycles(ctx)]);
  const now = currentPeriod(new Date(), project.timezone);
  // El mes en curso; si aún no está abierto, el último mes sin cerrar.
  const month =
    cycles.find((c) => c.period === now) ??
    [...cycles].sort((a, b) => b.period.localeCompare(a.period)).find((c) => c.status !== "closed" && c.period < now) ??
    null;
  const base = `/p/${projectId}`;

  return (
    <div className="flex flex-col gap-6">
      <div className="no-print -mt-2 flex flex-col gap-2 border-b border-border">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <Link href={base} className="flex min-w-0 items-baseline gap-2 rounded-sm focus-visible:ring-3 focus-visible:ring-(--ring) focus-visible:outline-none">
            <span className="truncate text-sm text-muted">{project.clientName}</span>
            <span aria-hidden="true" className="text-border-strong">
              ·
            </span>
            <span className="truncate font-semibold tracking-tight">{project.name}</span>
          </Link>
          <div className="flex items-center gap-2">
            {project.status === "archived" && <span className="badge">Archivado · solo lectura</span>}
            <a
              href={project.metricoolUrl ?? METRICOOL_HOME_URL}
              className="btn btn-secondary py-1.5"
              target="_blank"
              rel="noopener noreferrer"
            >
              Abrir Metricool <span aria-hidden="true">↗</span>
              <span className="sr-only">(se abre en otra pestaña)</span>
            </a>
          </div>
        </div>
        <ProjectNav
          base={base}
          month={month ? { period: month.period, label: formatPeriod(month.period, project.locale) } : null}
          canSettings={hasPermission(ctx, "project.settings")}
        />
      </div>
      {children}
    </div>
  );
}
