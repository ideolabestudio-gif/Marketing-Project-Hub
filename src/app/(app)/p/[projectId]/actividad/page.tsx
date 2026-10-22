import Link from "next/link";
import { Breadcrumbs, projectCrumbs } from "@/components/breadcrumbs";
import { projectContextForPage } from "@/lib/project-page";
import { formatInZone, formatPeriod } from "@/lib/time";
import { ACTION_LABELS, activityDetail } from "@/modules/activity/labels";
import { ACTIVITY_GROUPS, listProjectActivity, type ActivityGroup } from "@/modules/activity/service";
import { getProject } from "@/modules/projects/service";

import type { Metadata } from "next";
import { projectTitle } from "@/lib/page-title";

export async function generateMetadata({ params }: PageProps<"/p/[projectId]/actividad">): Promise<Metadata> {
  const { projectId } = await params;
  return projectTitle(projectId, "Actividad");
}

const GROUP_KEYS = Object.keys(ACTIVITY_GROUPS) as ActivityGroup[];

export default async function ActivityPage({ params, searchParams }: PageProps<"/p/[projectId]/actividad">) {
  const { projectId } = await params;
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const ctx = await projectContextForPage(projectId, "project.activity");
  const [project, activity] = await Promise.all([
    getProject(ctx),
    listProjectActivity(ctx, { group: one(sp.tipo), before: one(sp.antes) }),
  ]);
  const tz = project.timezone;
  const base = `/p/${projectId}`;
  const filterHref = (group: ActivityGroup | null) => `${base}/actividad${group ? `?tipo=${group}` : ""}`;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Breadcrumbs help="actividad" items={projectCrumbs(projectId, project.name)} />
        <h1 className="h1 mt-1">Actividad del proyecto</h1>
        <p className="mt-1 text-sm text-muted">
          Quién hizo qué y cuándo: aprobaciones, importaciones, meses reabiertos o eliminados… Sale del registro de
          auditoría, que no se puede modificar.
        </p>
      </div>

      <nav aria-label="Filtrar la actividad" className="flex flex-wrap gap-2 text-sm">
        <Link
          href={filterHref(null)}
          className="btn btn-secondary py-1"
          aria-current={activity.group === null ? "page" : undefined}
        >
          Todo
        </Link>
        {GROUP_KEYS.map((g) => (
          <Link
            key={g}
            href={filterHref(g)}
            className="btn btn-secondary py-1"
            aria-current={activity.group === g ? "page" : undefined}
          >
            {ACTIVITY_GROUPS[g].label}
          </Link>
        ))}
      </nav>

      <section className="card flex flex-col gap-3" aria-label="Eventos">
        {activity.events.length === 0 ? (
          <p className="text-sm text-muted">No hay actividad {activity.group ? "de este tipo" : "registrada"}.</p>
        ) : (
          <ol className="flex flex-col divide-y divide-border">
            {activity.events.map((e) => {
              const detail = activityDetail(e.action, e.data);
              return (
                <li key={e.id} className="flex flex-col gap-0.5 py-2.5 text-sm sm:flex-row sm:gap-4">
                  <time
                    dateTime={e.createdAt.toISOString()}
                    className="shrink-0 text-muted tabular-nums sm:w-40"
                  >
                    {formatInZone(e.createdAt, tz)}
                  </time>
                  <div className="min-w-0">
                    <span className="font-medium">{e.actorName ?? e.actorEmail ?? "Sistema"}</span>{" "}
                    {ACTION_LABELS[e.action] ?? e.action}
                    {e.itemId && e.period ? (
                      <>
                        {" · "}
                        <Link href={`${base}/ciclos/${e.period}/piezas/${e.itemId}`} className="link">
                          {e.itemTitle}
                        </Link>
                      </>
                    ) : e.period ? (
                      <>
                        {" · "}
                        <Link href={`${base}/ciclos/${e.period}`} className="link">
                          {formatPeriod(e.period, project.locale)}
                        </Link>
                      </>
                    ) : null}
                    {detail && <span className="block text-muted">{detail}</span>}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
        {activity.next && (
          <Link
            href={`${base}/actividad?${new URLSearchParams({ ...(activity.group && { tipo: activity.group }), antes: activity.next })}`}
            className="btn btn-secondary self-start"
          >
            Ver más antiguos
          </Link>
        )}
      </section>
    </div>
  );
}
