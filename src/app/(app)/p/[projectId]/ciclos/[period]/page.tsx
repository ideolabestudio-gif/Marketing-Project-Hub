import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { ChannelFormatSelect } from "@/components/channel-format-select";
import { orNotFound, projectContextForPage } from "@/lib/project-page";
import { formatPeriod, formatTimeInZone, formatInZone, monthGrid, zonedDay } from "@/lib/time";
import { hasPermission } from "@/modules/access/context";
import { formatLabel, ITEM_STATUS_LABELS } from "@/modules/content/formats";
import { listItems } from "@/modules/content/service";
import { CYCLE_STATUS_LABELS, getCycleByPeriod, SELECTABLE_STATUSES } from "@/modules/cycles/service";
import { getProject, listChannels } from "@/modules/projects/service";
import { createItemAction, setStatusAction, updateBriefAction } from "./actions";

const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

export default async function CyclePage({ params, searchParams }: PageProps<"/p/[projectId]/ciclos/[period]">) {
  const { projectId, period } = await params;
  const { vista } = await searchParams;
  const ctx = await projectContextForPage(projectId);
  const cycle = await orNotFound(getCycleByPeriod(ctx, period));
  const [project, channels, items] = await Promise.all([getProject(ctx), listChannels(ctx), listItems(ctx, cycle.id)]);

  const closed = cycle.status === "closed";
  const canManage = hasPermission(ctx, "cycle.manage") && !closed;
  const canWrite = hasPermission(ctx, "content.write") && !closed;
  const view = vista === "lista" ? "lista" : "calendario";
  const base = `/p/${projectId}/ciclos/${period}`;
  const tz = project.timezone;

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
          <Link href={`/p/${projectId}`} className="link text-sm">
            ← {project.name}
          </Link>
          <h1 className="h1 mt-1">{formatPeriod(cycle.period, project.locale)}</h1>
          <div className="mt-2 flex gap-2">
            <span className="badge">{CYCLE_STATUS_LABELS[cycle.status]}</span>
            <span className="badge">{items.length} piezas</span>
            <span className="badge">Horario: {tz}</span>
          </div>
        </div>
        {canManage && (
          <ActionForm action={setStatusAction.bind(null, projectId, cycle.id)} submitLabel="Cambiar estado" variant="secondary">
            <select name="status" defaultValue={cycle.status} className="input">
              {SELECTABLE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {CYCLE_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </ActionForm>
        )}
      </div>

      <section className="card flex flex-col gap-3">
        <h2 className="h2">Brief del mes</h2>
        {canManage ? (
          <ActionForm action={updateBriefAction.bind(null, projectId, cycle.id)} submitLabel="Guardar brief" className="grid gap-3">
            <label className="field">
              Objetivos
              <textarea name="objectives" className="input min-h-20" defaultValue={cycle.objectives ?? ""} />
            </label>
            <label className="field">
              Fechas clave
              <textarea name="keyDates" className="input min-h-16" defaultValue={cycle.keyDates ?? ""} />
            </label>
            <label className="field">
              Notas
              <textarea name="notes" className="input min-h-16" defaultValue={cycle.notes ?? ""} />
            </label>
          </ActionForm>
        ) : (
          <dl className="grid gap-2 text-sm">
            <dt className="text-muted">Objetivos</dt>
            <dd className="whitespace-pre-wrap">{cycle.objectives || "—"}</dd>
            <dt className="text-muted">Fechas clave</dt>
            <dd className="whitespace-pre-wrap">{cycle.keyDates || "—"}</dd>
            <dt className="text-muted">Notas</dt>
            <dd className="whitespace-pre-wrap">{cycle.notes || "—"}</dd>
          </dl>
        )}
      </section>

      {canWrite && (
        <section className="card flex flex-col gap-3">
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
                />
              </label>
            </ActionForm>
          ) : (
            <p className="text-sm text-muted">Configura algún canal en Ajustes antes de crear piezas.</p>
          )}
        </section>
      )}

      <section className="card flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <h2 className="h2">Plan del mes</h2>
          <nav className="flex gap-3 text-sm">
            <Link href={`${base}?vista=calendario`} className={view === "calendario" ? "font-semibold" : "link"}>
              Calendario
            </Link>
            <Link href={`${base}?vista=lista`} className={view === "lista" ? "font-semibold" : "link"}>
              Lista
            </Link>
          </nav>
        </div>

        {view === "calendario" ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] table-fixed border-collapse text-xs">
                <thead>
                  <tr>
                    {WEEKDAYS.map((d) => (
                      <th key={d} className="pb-1 text-left font-medium text-muted">
                        {d}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {monthGrid(cycle.period).map((week, i) => (
                    <tr key={i}>
                      {week.map((day, j) => (
                        <td key={j} className="h-24 border border-border p-1 align-top">
                          {day && (
                            <>
                              <div className="text-muted">{Number(day.slice(8))}</div>
                              <ul className="mt-1 flex flex-col gap-1">
                                {(byDay.get(day) ?? []).map((item) => (
                                  <li key={item.id}>
                                    <Link
                                      href={`${base}/piezas/${item.id}`}
                                      className={`block truncate rounded bg-background px-1 py-0.5 hover:underline ${item.status === "cancelled" ? "line-through opacity-60" : ""}`}
                                      title={`${item.title} · ${item.channelName}`}
                                    >
                                      {formatTimeInZone(item.plannedAt!, tz)} {item.title}
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
            {undated.length > 0 && (
              <div className="text-sm">
                <h3 className="font-medium">Sin fecha</h3>
                <ul className="mt-1 list-disc pl-5">
                  {undated.map((item) => (
                    <li key={item.id}>
                      <Link href={`${base}/piezas/${item.id}`} className="link">
                        {item.title}
                      </Link>{" "}
                      <span className="text-muted">· {item.channelName}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted">Aún no hay piezas en este ciclo.</p>
        ) : (
          <table className="table">
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
              {items.map((item) => (
                <tr key={item.id}>
                  <td className="whitespace-nowrap">{item.plannedAt ? formatInZone(item.plannedAt, tz) : "—"}</td>
                  <td>
                    <Link href={`${base}/piezas/${item.id}`} className="link">
                      {item.title}
                    </Link>
                  </td>
                  <td>{item.channelName}</td>
                  <td>{formatLabel(item.format)}</td>
                  <td>{ITEM_STATUS_LABELS[item.status]}</td>
                  <td>{item.latestVersion ? `v${item.latestVersion}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
