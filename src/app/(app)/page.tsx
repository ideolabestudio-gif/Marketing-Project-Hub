import Link from "next/link";
import { HelpLink } from "@/components/breadcrumbs";
import { StatusPill } from "@/components/status-pill";
import { ROLE_LABELS } from "@/modules/access/permissions";
import { listMyProjects } from "@/modules/access/service";
import { formatLabel } from "@/modules/content/formats";
import { requireActor } from "@/modules/identity/next";
import { formatDay, formatInZone, formatPeriod, formatTimeInZone, weekOf, zonedDay } from "@/lib/time";
import { listMyMonths, listMyPendingWork, listMyWeek, PENDING_ACTION_LABELS, type PendingAction } from "@/modules/review/service";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Inicio" };

/** Zona para la cabecera cuando el usuario aún no tiene piezas (la de cada pieza manda en su fila). */
const DEFAULT_TIMEZONE = "Europe/Madrid";

const pieceHref = (p: { projectId: string; period: string; itemId: string }, section?: string) =>
  `/p/${p.projectId}/ciclos/${p.period}/piezas/${p.itemId}${section ? `#${section}` : ""}`;

/** Botón de cada tarea pendiente. Todas llevan a la sección «Revisión y publicación» de la pieza. */
const ACTION_BUTTONS: Record<PendingAction, string> = {
  review: "Revisar",
  client: "Registrar respuesta",
  fix: "Ver los cambios",
  publish: "Copiar para Metricool",
  confirm: "Confirmar",
};

export default async function HomePage() {
  const actor = await requireActor();
  const now = new Date();
  const [projects, pending, week, months] = await Promise.all([
    listMyProjects(actor),
    listMyPendingWork(actor, now),
    listMyWeek(actor, now),
    listMyMonths(actor, now),
  ]);

  const timezone = week[0]?.timezone ?? pending[0]?.timezone ?? DEFAULT_TIMEZONE;
  const today = zonedDay(now, timezone);
  const { start, end } = weekOf(today);

  const toSchedule = pending.filter((p) => p.action === "publish");
  const otherPending = pending.filter((p) => p.action !== "publish");
  const overdue = week.filter((w) => w.overdue && w.day < today);
  const byDay = new Map<string, typeof week>();
  for (const w of week) {
    if (w.overdue && w.day < today) continue;
    byDay.set(w.day, [...(byDay.get(w.day) ?? []), w]);
  }
  const dueThisWeek = week.filter((w) => w.day >= start).length;
  const weekRange = formatWeekRange(start, end);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted first-letter:uppercase">{formatDay(today)}</p>
          <h1 className="h1 mt-1">Inicio</h1>
        </div>
        <HelpLink section="inicio" />
      </div>

      {projects.length > 0 && (
        <>
          <ul className="grid gap-4 sm:grid-cols-3">
            <StatTile href="#semana" value={dueThisWeek} label="Vencen esta semana" linked={week.length > 0}>
              {overdue.length > 0 ? (
                <span className="font-medium text-danger">
                  {overdue.length} {overdue.length === 1 ? "atrasada" : "atrasadas"} de antes
                </span>
              ) : (
                weekRange
              )}
            </StatTile>
            <StatTile href="#por-programar" value={toSchedule.length} label="Por programar en Metricool" accent>
              Aprobadas, sin programar todavía
            </StatTile>
            <StatTile href="#pendiente" value={otherPending.length} label="Pendiente de mí">
              Revisar, corregir o confirmar
            </StatTile>
          </ul>

          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <section id="semana" className="card flex min-w-0 scroll-mt-20 flex-col gap-4">
              <div>
                <h2 className="h2">Esta semana</h2>
                <p className="text-sm text-muted">Lo que tiene fecha {weekRange} en todos tus proyectos.</p>
              </div>
              {overdue.length === 0 && byDay.size === 0 ? (
                <EmptyState>No vence nada esta semana.</EmptyState>
              ) : (
                <div className="flex flex-col gap-5">
                  {overdue.length > 0 && (
                    <DayGroup title="Atrasadas" tone="danger" hint="Con fecha pasada y sin programar ni publicar">
                      {overdue.map((w) => (
                        <WeekRow key={w.itemId} entry={w} when={formatInZone(w.plannedAt, w.timezone)} />
                      ))}
                    </DayGroup>
                  )}
                  {[...byDay.entries()].map(([day, entries]) => (
                    <DayGroup
                      key={day}
                      title={formatDay(day)}
                      tone={day === today ? "today" : day < today ? "past" : "normal"}
                    >
                      {entries.map((w) => (
                        <WeekRow key={w.itemId} entry={w} when={formatTimeInZone(w.plannedAt, w.timezone)} />
                      ))}
                    </DayGroup>
                  ))}
                </div>
              )}
            </section>

            <section id="por-programar" className="card flex min-w-0 scroll-mt-20 flex-col gap-4">
              <div>
                <h2 className="h2">Por programar en Metricool</h2>
                <p className="text-sm text-muted">
                  Pulsa «Copiar para Metricool» en cada pieza, o cópialas todas a la vez desde el plan del mes, pégalo en Claude y registra aquí la programación.
                </p>
              </div>
              {toSchedule.length === 0 ? (
                <EmptyState>No hay piezas aprobadas esperando.</EmptyState>
              ) : (
                <ul className="flex flex-col gap-2">
                  {toSchedule.map((p) => (
                    <li key={p.itemId}>
                      <Link
                        href={pieceHref(p, "programar")}
                        className="group flex flex-col gap-1 rounded-lg border border-border bg-surface-muted px-3 py-2.5 transition hover:border-accent/40 hover:bg-accent-soft sm:flex-row sm:items-center sm:gap-3"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium group-hover:text-accent-ink sm:truncate">{p.title}</div>
                          <div className="text-xs text-muted sm:truncate">
                            {p.clientName} · {p.channelName} · {formatLabel(p.format)}
                          </div>
                        </div>
                        <div className="flex shrink-0 gap-2 text-xs sm:block sm:text-right">
                          <div className="font-medium whitespace-nowrap">
                            {p.plannedAt ? formatInZone(p.plannedAt, p.timezone) : "Sin fecha"}
                          </div>
                          {p.channelKind === "email" && <div className="text-muted">Va a MailerLite</div>}
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <section id="pendiente" className="card flex min-w-0 scroll-mt-20 flex-col gap-3">
            <h2 className="h2">Pendiente de mí</h2>
            {otherPending.length === 0 ? (
              <EmptyState>Nada pendiente de revisar, corregir ni confirmar.</EmptyState>
            ) : (
              <ul className="flex flex-col gap-2">
                {otherPending.map((p) => (
                  <li key={p.itemId}>
                    <Link
                      href={pieceHref(p, "revision")}
                      className="group flex flex-col gap-2 rounded-lg border border-border bg-surface-muted px-4 py-3 transition hover:border-accent/40 hover:bg-accent-soft sm:flex-row sm:items-center sm:gap-4"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-medium tracking-wide text-muted uppercase">
                          {PENDING_ACTION_LABELS[p.action]}
                        </div>
                        <div className="mt-0.5 text-sm font-medium group-hover:text-accent-ink sm:truncate">
                          {p.title}
                        </div>
                        <div className="text-xs text-muted sm:truncate">
                          {p.clientName} · {p.projectName} ·{" "}
                          {p.plannedAt ? formatInZone(p.plannedAt, p.timezone) : formatPeriod(p.period)}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <StatusPill status={p.status} />
                        <span className="btn btn-secondary py-1.5 group-hover:border-accent/40 group-hover:text-accent-ink">
                          {ACTION_BUTTONS[p.action]} <span aria-hidden>→</span>
                        </span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      <section className="flex flex-col gap-4">
        <h2 className="h2">Mis proyectos</h2>
        {projects.length === 0 ? (
          <div className="card text-sm text-muted">
            Todavía no eres miembro de ningún proyecto.
            {actor.isAdmin && (
              <>
                {" "}
                Como administrador puedes crear clientes y proyectos y asignarte en{" "}
                <Link href="/admin" className="link">
                  Administración
                </Link>
                .
              </>
            )}
          </div>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => {
              const month = months.find((m) => m.projectId === p.projectId);
              const monthName = month ? formatPeriod(month.period) : "";
              return (
                <li
                  key={p.projectId}
                  className="card flex h-full flex-col gap-3 transition hover:border-accent/40 hover:shadow-(--shadow-hover)"
                >
                  <Link href={`/p/${p.projectId}`} className="block rounded-sm focus-visible:ring-3 focus-visible:ring-(--ring) focus-visible:outline-none">
                    <div className="text-xs text-muted">{p.clientName}</div>
                    <div className="mt-1 text-base font-semibold tracking-tight">{p.projectName}</div>
                  </Link>
                  <div className="flex flex-wrap gap-2">
                    <span className="badge">{ROLE_LABELS[p.role]}</span>
                    {p.projectStatus === "archived" && <span className="badge">Archivado</span>}
                  </div>
                  {month && (
                    <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-sm">
                      {month.cycleOpen ? (
                        <>
                          <span className="text-muted">
                            {month.cycleClosed
                              ? "Mes cerrado"
                              : month.total === 0
                                ? "Sin piezas todavía"
                                : `${month.total} ${month.total === 1 ? "pieza" : "piezas"} · ${month.approved} aprobadas · ${month.out} programadas`}
                          </span>
                          <Link href={`/p/${p.projectId}/ciclos/${month.period}`} className="btn btn-secondary py-1">
                            {monthName}
                            <span className="sr-only"> de {p.projectName}</span> <span aria-hidden="true">→</span>
                          </Link>
                        </>
                      ) : (
                        <span className="text-muted">{monthName}: ciclo sin abrir</span>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

/** Contador del inicio. Solo es un enlace si hay algo que ver en su sección: con 0 no lleva a nada. */
function StatTile(props: {
  href: string;
  value: number;
  label: string;
  accent?: boolean;
  linked?: boolean;
  children: React.ReactNode;
}) {
  const highlighted = props.accent && props.value > 0;
  const linked = props.linked ?? props.value > 0;
  const content = (
    <>
      <span className={`text-3xl font-semibold tracking-tight ${highlighted ? "text-accent-ink" : ""}`}>
        {props.value}
      </span>
      <span className="text-sm font-medium">{props.label}</span>
      <span className="text-xs text-muted first-letter:uppercase">{props.children}</span>
    </>
  );
  if (!linked) {
    return (
      <li>
        <div className="card flex h-full flex-col gap-1 p-5">{content}</div>
      </li>
    );
  }
  return (
    <li>
      <a
        href={props.href}
        className={`card flex h-full flex-col gap-1 p-5 transition hover:-translate-y-0.5 hover:shadow-(--shadow-hover) ${
          highlighted ? "border-accent/40 bg-accent-soft" : "hover:border-accent/40"
        }`}
      >
        {content}
        <span className="mt-1 text-xs font-medium text-accent">
          Ver {props.value === 1 ? "cuál" : "cuáles"} <span aria-hidden>↓</span>
        </span>
      </a>
    </li>
  );
}

function DayGroup(props: {
  title: string;
  tone: "danger" | "today" | "past" | "normal";
  hint?: string;
  children: React.ReactNode;
}) {
  const titleClass = {
    danger: "text-danger",
    today: "text-accent-ink",
    past: "text-muted",
    normal: "",
  }[props.tone];
  return (
    <div className="flex flex-col gap-1.5">
      <h3 className={`flex items-baseline gap-2 text-sm font-semibold first-letter:uppercase ${titleClass}`}>
        {props.title}
        {props.tone === "today" && (
          <span className="rounded-full bg-accent px-2 py-0.5 text-[0.7rem] font-semibold text-on-accent">Hoy</span>
        )}
        {props.hint && <span className="text-xs font-normal text-muted">{props.hint}</span>}
      </h3>
      <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-lg border border-border">
        {props.children}
      </ul>
    </div>
  );
}

function WeekRow({ entry, when }: { entry: Awaited<ReturnType<typeof listMyWeek>>[number]; when: string }) {
  return (
    <li>
      <Link
        href={pieceHref(entry)}
        className="flex items-start gap-3 px-3 py-2.5 transition-colors hover:bg-surface-muted sm:items-center"
      >
        <span className="w-14 shrink-0 pt-0.5 text-xs text-muted tabular-nums sm:w-24 sm:pt-0">{when}</span>
        <div className="flex min-w-0 flex-1 flex-col items-start gap-1 sm:flex-row sm:items-center sm:gap-3">
          <div className="min-w-0 sm:flex-1">
            <div className="text-sm font-medium sm:truncate">{entry.title}</div>
            <div className="text-xs text-muted sm:truncate">
              {entry.clientName} · {entry.channelName} · {formatLabel(entry.format)}
            </div>
          </div>
          <StatusPill status={entry.status} />
        </div>
      </Link>
    </li>
  );
}

/** "del 12 al 18 de octubre" o, si cambia el mes, "del 28 de diciembre al 3 de enero". */
function formatWeekRange(start: string, end: string): string {
  const fmt = (day: string, opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("es-ES", { ...opts, timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`));
  const sameMonth = start.slice(0, 7) === end.slice(0, 7);
  const from = sameMonth ? fmt(start, { day: "numeric" }) : fmt(start, { day: "numeric", month: "long" });
  return `del ${from} al ${fmt(end, { day: "numeric", month: "long" })}`;
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted">{children}</p>
  );
}
