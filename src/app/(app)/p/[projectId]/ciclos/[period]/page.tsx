import Link from "next/link";
import { Breadcrumbs, projectCrumbs } from "@/components/breadcrumbs";
import { ActionForm } from "@/components/action-form";
import { ChannelFormatSelect } from "@/components/channel-format-select";
import { orNotFound, projectContextForPage } from "@/lib/project-page";
import { formatPeriod, formatTimeInZone, formatInZone, monthGrid, zonedDay } from "@/lib/time";
import { hasPermission } from "@/modules/access/context";
import { formatLabel } from "@/modules/content/formats";
import { listItems } from "@/modules/content/service";
import { CYCLE_STATUS_LABELS, getCycleByPeriod, SELECTABLE_STATUSES } from "@/modules/cycles/service";
import { getProject, listChannels } from "@/modules/projects/service";
import { getCycleMetrics } from "@/modules/metrics/service";
import { getReport } from "@/modules/reports/service";
import { cycleProgress } from "@/modules/cycles/progress";
import { STATUS_STYLES, STATUS_SYMBOLS } from "@/components/status-pill";
import { WORKFLOW_LABELS, type WorkflowStatus } from "@/modules/review/domain";
import { listCycleStatuses } from "@/modules/review/service";
import { CalendarPlanSection } from "./calendar-plan-section";
import { CycleProgress } from "./cycle-progress";
import { IdeasSection } from "./ideas-section";
import { MetricoolMonthSection } from "./metricool-month-section";
import { closeCycleAction, createItemAction, reopenCycleAction, setStatusAction } from "./actions";
import { DeleteCycleSection } from "./delete-cycle-section";

import type { Metadata } from "next";
import { cycleTitle } from "@/lib/page-title";

export async function generateMetadata({ params }: PageProps<"/p/[projectId]/ciclos/[period]">): Promise<Metadata> {
  const { projectId, period } = await params;
  return cycleTitle(projectId, period);
}

const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

export default async function CyclePage({ params, searchParams }: PageProps<"/p/[projectId]/ciclos/[period]">) {
  const { projectId, period } = await params;
  const query = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const vista = one(query.vista);
  const channelFilter = one(query.canal);
  const statusFilter = one(query.estado);
  const newDay = one(query.nueva);
  const ctx = await projectContextForPage(projectId);
  const cycle = await orNotFound(getCycleByPeriod(ctx, period));
  const [project, channels, items, statuses, report, metrics] = await Promise.all([
    getProject(ctx),
    listChannels(ctx),
    listItems(ctx, cycle.id),
    listCycleStatuses(ctx, cycle.id),
    getReport(ctx, cycle.id),
    getCycleMetrics(ctx, cycle.id),
  ]);
  const statusOf = (id: string): WorkflowStatus => statuses[id] ?? "idea";

  const closed = cycle.status === "closed";
  const canManage = hasPermission(ctx, "cycle.manage") && !closed;
  const canWrite = hasPermission(ctx, "content.write") && !closed;
  const isManager = hasPermission(ctx, "cycle.manage");
  const reportApproved = report?.report.status === "approved";
  const view = vista === "lista" ? "lista" : "calendario";
  const base = `/p/${projectId}/ciclos/${period}`;
  const tz = project.timezone;
  const today = zonedDay(new Date(), tz);
  const briefEmpty = !cycle.objectives && !cycle.keyDates && !cycle.notes;

  const pendingImports = metrics.imports.filter((i) => i.status === "pending");
  const steps = cycleProgress({
    briefFilled: !briefEmpty,
    statuses: items.map((item) => statusOf(item.id)),
    hasMetrics: metrics.values.some((v) => v.isCurrent),
    report: !report ? "none" : reportApproved ? "approved" : "draft",
    closed,
  });

  const listed = items.filter(
    (item) =>
      (!channelFilter || item.channelId === channelFilter) && (!statusFilter || statusOf(item.id) === statusFilter),
  );
  const prefillDay = /^\d{4}-\d{2}-\d{2}$/.test(newDay) && newDay.startsWith(period) ? newDay : null;
  const dayLabel = (day: string) =>
    new Intl.DateTimeFormat(project.locale, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(
      new Date(`${day}T12:00:00Z`),
    );

  const toSchedule = items
    .filter((item) => item.channelKind !== "email" && statusOf(item.id) === "approved")
    .map((item) => item.id);

  const byDay = new Map<string, typeof items>();
  const undated: typeof items = [];
  for (const item of items) {
    if (!item.plannedAt) undated.push(item);
    else {
      const day = zonedDay(item.plannedAt, tz);
      byDay.set(day, [...(byDay.get(day) ?? []), item]);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Breadcrumbs help="mes" items={projectCrumbs(projectId, project.name)} />
          <h1 className="h1 mt-1">{formatPeriod(cycle.period, project.locale)}</h1>
          <div className="mt-2 flex flex-wrap gap-2">
            <span className="badge">{CYCLE_STATUS_LABELS[cycle.status]}</span>
            <span className="badge">{items.length} piezas</span>
            <span className="badge">Horario: {tz}</span>
          </div>
        </div>
        {isManager && (
          <Link href="#gestionar" className="btn btn-secondary">
            Gestionar el mes
          </Link>
        )}
      </div>

      <CycleProgress steps={steps} base={base} />

      {pendingImports.length > 0 && (
        <p className="notice">
          {pendingImports.length === 1
            ? "Hay 1 importación de métricas esperando a que asignes sus columnas."
            : `Hay ${pendingImports.length} importaciones de métricas esperando a que asignes sus columnas.`}{" "}
          <Link href={`${base}/metricas/importar/${pendingImports[0].id}`} className="link">
            Asignar columnas
          </Link>
        </p>
      )}

      {closed && (
        <section className="card flex flex-col gap-3">
          <h2 className="h2">Ciclo cerrado</h2>
          <p className="text-sm text-muted">
            {cycle.closedAt && `Cerrado el ${formatInZone(cycle.closedAt, tz)}. `}El mes queda en solo lectura.
          </p>
          <h3 className="font-medium">Aprendizajes</h3>
          <p className="whitespace-pre-wrap text-sm">{cycle.learnings || "—"}</p>
          {isManager && (
            <Link href="#gestionar" className="link self-start text-sm">
              Reabrir el mes
            </Link>
          )}
        </section>
      )}

      <section className="card flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="h2">Plan del mes</h2>
          <div className="flex flex-wrap items-center gap-2">
            {canWrite && (
              <Link href="#nueva-pieza" className="btn btn-secondary">
                + Nueva pieza
              </Link>
            )}
            <nav className="segmented" aria-label="Vista del plan">
              <Link href={`${base}?vista=calendario`} aria-current={view === "calendario" ? "page" : undefined}>
                Calendario
              </Link>
              <Link href={`${base}?vista=lista`} aria-current={view === "lista" ? "page" : undefined}>
                Lista
              </Link>
            </nav>
          </div>
        </div>

        {view === "calendario" ? (
          <>
            {/* En el móvil, una agenda día a día en lugar de la cuadrícula del mes. */}
            <div className="sm:hidden">
              {byDay.size === 0 ? (
                <p className="text-sm text-muted">Aún no hay piezas con fecha en este mes.</p>
              ) : (
                <ol className="flex flex-col gap-3">
                  {[...byDay.keys()].sort().map((day) => (
                    <li key={day}>
                      <h3 className={`text-sm font-medium first-letter:uppercase ${day === today ? "text-accent-ink" : ""}`}>
                        {dayLabel(day)}
                        {day === today && <span className="badge ml-2">Hoy</span>}
                      </h3>
                      <ul className="mt-1 flex flex-col gap-1">
                        {byDay.get(day)!.map((item) => (
                          <li key={item.id}>
                            <Link
                              href={`${base}/piezas/${item.id}`}
                              className={`flex items-center gap-2 rounded-md px-2.5 py-2 text-sm ${STATUS_STYLES[statusOf(item.id)]}`}
                            >
                              <span aria-hidden="true" className="w-3 text-center">
                                {STATUS_SYMBOLS[statusOf(item.id)]}
                              </span>
                              <span className="opacity-70">{formatTimeInZone(item.plannedAt!, tz)}</span>
                              <span className="min-w-0 grow truncate font-medium">{item.title}</span>
                              <span className="shrink-0 text-xs opacity-80">{WORKFLOW_LABELS[statusOf(item.id)]}</span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ol>
              )}
            </div>
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full min-w-[720px] table-fixed border-separate border-spacing-1 text-xs">
                <thead>
                  <tr>
                    {WEEKDAYS.map((d) => (
                      <th key={d} className="px-1.5 pb-1 text-left text-[11px] font-medium tracking-wide text-muted uppercase">
                        {d}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {monthGrid(cycle.period).map((week, i) => (
                    <tr key={i}>
                      {week.map((day, j) => (
                        <td
                          key={j}
                          className={
                            day
                              ? `h-28 rounded-lg border p-1.5 align-top ${
                                  day === today ? "border-accent/60 ring-2 ring-accent/15" : "border-border"
                                } ${j >= 5 ? "bg-surface-muted" : "bg-surface"}`
                              : "align-top"
                          }
                        >
                          {day && (
                            <>
                              <div className="flex items-start justify-between gap-1">
                                <div
                                  className={
                                    day === today
                                      ? "inline-grid size-5 place-items-center rounded-full bg-accent font-semibold text-on-accent"
                                      : "px-0.5 font-medium text-muted"
                                  }
                                >
                                  {Number(day.slice(8))}
                                </div>
                                {canWrite && (
                                  <Link
                                    href={`${base}?nueva=${day}#nueva-pieza`}
                                    className="rounded px-1 leading-none text-muted opacity-50 hover:bg-surface-muted hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-(--ring) focus-visible:outline-none"
                                    aria-label={`Nueva pieza el ${dayLabel(day)}`}
                                    title="Nueva pieza este día"
                                  >
                                    +
                                  </Link>
                                )}
                              </div>
                              <ul className="mt-1 flex flex-col gap-1">
                                {(byDay.get(day) ?? []).map((item) => (
                                  <li key={item.id}>
                                    <Link
                                      href={`${base}/piezas/${item.id}`}
                                      className={`block truncate rounded-md px-1.5 py-1 font-medium transition hover:brightness-95 ${STATUS_STYLES[statusOf(item.id)]}`}
                                      title={`${item.title} · ${item.channelName} · ${WORKFLOW_LABELS[statusOf(item.id)]}`}
                                    >
                                      <span aria-hidden="true" className="mr-0.5 inline-block w-3 text-center">
                                        {STATUS_SYMBOLS[statusOf(item.id)]}
                                      </span>
                                      <span className="font-normal opacity-70">{formatTimeInZone(item.plannedAt!, tz)}</span> {item.title}
                                      <span className="sr-only">
                                        {" "}
                                        · {item.channelName} · {WORKFLOW_LABELS[statusOf(item.id)]}
                                      </span>
                                    </Link>
                                  </li>
                                ))}
                              </ul>
                            </>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="flex flex-wrap gap-2 text-xs" aria-label="Leyenda de estados">
              {(["draft", "in_review", "changes_requested", "approved", "scheduled", "published"] as const).map((st) => (
                <li key={st} className={`rounded-full px-2.5 py-0.5 ${STATUS_STYLES[st]}`}>
                  <span aria-hidden="true">{STATUS_SYMBOLS[st]}</span> {WORKFLOW_LABELS[st]}
                </li>
              ))}
            </ul>
            {undated.length > 0 && (
              <div className="text-sm">
                <h3 className="font-medium">Sin fecha</h3>
                <ul className="mt-1 list-disc pl-5">
                  {undated.map((item) => (
                    <li key={item.id}>
                      <Link href={`${base}/piezas/${item.id}`} className="link">
                        {item.title}
                      </Link>{" "}
                      <span className="text-muted">
                        · {item.channelName} · {WORKFLOW_LABELS[statusOf(item.id)]}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted">Aún no hay piezas en este ciclo.</p>
        ) : (
          <>
            <form method="get" action={base} className="flex flex-wrap items-end gap-3 text-sm" aria-label="Filtrar la lista">
              <input type="hidden" name="vista" value="lista" />
              <label className="field">
                Canal
                <select name="canal" defaultValue={channelFilter} className="input">
                  <option value="">Todos</option>
                  {channels.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.displayName}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Estado
                <select name="estado" defaultValue={statusFilter} className="input">
                  <option value="">Todos</option>
                  {(Object.keys(WORKFLOW_LABELS) as WorkflowStatus[]).map((st) => (
                    <option key={st} value={st}>
                      {WORKFLOW_LABELS[st]}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" className="btn btn-secondary">
                Filtrar
              </button>
              {(channelFilter || statusFilter) && (
                <Link href={`${base}?vista=lista`} className="link self-center">
                  Quitar filtros
                </Link>
              )}
            </form>
            {listed.length === 0 ? (
              <p className="text-sm text-muted">Ninguna pieza cumple el filtro.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="table min-w-[640px]">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Pieza</th>
                      <th>Canal</th>
                      <th>Formato</th>
                      <th>Estado</th>
                      <th>Versión</th>
                    </tr>
                  </thead>
                  <tbody>
                    {listed.map((item) => (
                      <tr key={item.id}>
                        <td className="whitespace-nowrap">{item.plannedAt ? formatInZone(item.plannedAt, tz) : "—"}</td>
                        <td>
                          <Link href={`${base}/piezas/${item.id}`} className="link">
                            {item.title}
                          </Link>
                        </td>
                        <td>{item.channelName}</td>
                        <td>{formatLabel(item.format)}</td>
                        <td>{WORKFLOW_LABELS[statusOf(item.id)]}</td>
                        <td>{item.latestVersion ? `v${item.latestVersion}` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>

      <MetricoolMonthSection ctx={ctx} base={base} brand={project.clientName} tz={tz} itemIds={toSchedule} />

      {canWrite && (
        <section id="nueva-pieza" className="card flex scroll-mt-20 flex-col gap-3">
          <h2 className="h2">Nueva pieza</h2>
          {channels.some((c) => c.isActive) ? (
            <ActionForm action={createItemAction.bind(null, projectId, cycle.id, period)} submitLabel="Crear pieza">
              <label className="field">
                Título interno
                <input name="title" className="input" placeholder="Lanzamiento cerveza de otoño" required />
              </label>
              <label className="field">
                Canal y formato
                <ChannelFormatSelect channels={channels} />
              </label>
              <label className="field">
                Fecha prevista ({tz})
                <input
                  type="datetime-local"
                  name="plannedAt"
                  className="input"
                  min={`${period}-01T00:00`}
                  max={`${period}-31T23:59`}
                  defaultValue={prefillDay ? `${prefillDay}T10:00` : undefined}
                  key={prefillDay ?? "sin-fecha"}
                />
              </label>
            </ActionForm>
          ) : (
            <p className="text-sm text-muted">
              Para crear piezas hace falta algún canal activo.{" "}
              {hasPermission(ctx, "project.settings") ? (
                <Link href={`/p/${projectId}/ajustes#canales`} className="link">
                  Añadir o activar canales
                </Link>
              ) : (
                "Pídeselo a la responsable de cuenta."
              )}
            </p>
          )}
        </section>
      )}

      <h2 className="eyebrow -mb-3">Preparar el mes con Claude</h2>
      <CalendarPlanSection
        ctx={ctx}
        projectId={projectId}
        cycleId={cycle.id}
        period={cycle.period}
        writable={canWrite}
        tz={tz}
        emptyCycle={items.length === 0}
      />
      <IdeasSection ctx={ctx} projectId={projectId} cycleId={cycle.id} writable={canWrite} tz={tz} />

      {isManager && (
        <section id="gestionar" className="card flex scroll-mt-20 flex-col gap-5" aria-labelledby="gestionar-titulo">
          <div>
            <h2 id="gestionar-titulo" className="h2">
              Gestionar el mes
            </h2>
            <p className="mt-1 text-sm text-muted">Solo la responsable de cuenta. Eliminar el mes está justo debajo.</p>
          </div>
          {canManage && (
            <div className="flex flex-col gap-2">
              <h3 className="font-medium">Fase del mes</h3>
              <p className="text-sm text-muted">
                Es una etiqueta para orientaros; lo que de verdad falta lo dice «Cómo va el mes», arriba.
              </p>
              <ActionForm action={setStatusAction.bind(null, projectId, cycle.id)} submitLabel="Cambiar fase" variant="secondary">
                <select name="status" defaultValue={cycle.status} className="input" aria-label="Fase del mes">
                  {SELECTABLE_STATUSES.map((st) => (
                    <option key={st} value={st}>
                      {CYCLE_STATUS_LABELS[st]}
                    </option>
                  ))}
                </select>
              </ActionForm>
            </div>
          )}
          <div id="cerrar" className="flex scroll-mt-20 flex-col gap-2">
            <h3 className="font-medium">{closed ? "Reabrir el mes" : "Cerrar el mes"}</h3>
            {closed ? (
              <ActionForm action={reopenCycleAction.bind(null, projectId, cycle.id)} submitLabel="Reabrir ciclo" variant="secondary">
                <input name="reason" className="input" placeholder="Motivo para reabrir" aria-label="Motivo para reabrir" required />
              </ActionForm>
            ) : reportApproved ? (
              <ActionForm action={closeCycleAction.bind(null, projectId, cycle.id)} submitLabel="Cerrar ciclo" className="grid gap-3">
                <label className="field">
                  Aprendizajes del mes (qué funcionó, qué cambiar el mes que viene)
                  <textarea name="learnings" className="input min-h-24" required />
                </label>
              </ActionForm>
            ) : (
              <p className="text-sm text-muted">
                Para cerrar el mes, el <Link href={`${base}/informe`} className="link">informe</Link> tiene que estar
                aprobado. Al cerrarlo, todo el ciclo queda en solo lectura.
              </p>
            )}
          </div>
        </section>
      )}

      {isManager && (
        <DeleteCycleSection
          ctx={ctx}
          projectId={projectId}
          cycleId={cycle.id}
          period={cycle.period}
          periodLabel={formatPeriod(cycle.period, project.locale)}
          closed={closed}
          reportApproved={reportApproved}
        />
      )}
    </div>
  );
}
