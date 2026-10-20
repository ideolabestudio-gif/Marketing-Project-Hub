import type { ReactNode } from "react";
import { formatChange, formatMetric, SOURCE_LABELS, type MetricUnit } from "@/lib/format";
import { formatInZone, formatPeriod } from "@/lib/time";
import { formatLabel } from "@/modules/content/formats";
import type { getReportView } from "@/modules/reports/service";

type View = Awaited<ReturnType<typeof getReportView>>;

/** Controles de edición de una sección (solo en la página del informe, nunca al imprimir). */
export type SectionTools = { bar?: ReactNode; editor?: ReactNode };

/** Controles de las cifras destacadas: «Quitar» por cifra y el formulario para añadir. */
export type HighlightTools = { remove: Record<string, ReactNode>; add?: ReactNode };

/**
 * Evolución de una métrica en los últimos meses: una barra por mes, el actual resaltado.
 * Un mes sin dato es un hueco (nunca cero ni estimación). Cada barra lleva su valor.
 */
function Trend({
  history,
  periods,
  unit,
  locale,
}: {
  history: (number | null)[];
  periods: string[];
  unit: MetricUnit;
  locale: string;
}) {
  const known = history.filter((v): v is number => v !== null);
  if (known.length < 2) return null;
  const max = Math.max(...known.map(Math.abs)) || 1;
  const bar = 9;
  const gap = 4;
  const h = 28;
  const label = history
    .map((v, i) => `${formatPeriod(periods[i], locale)}: ${formatMetric(v, unit, locale)}`)
    .join(" · ");
  return (
    <svg
      width={history.length * (bar + gap) - gap}
      height={h}
      viewBox={`0 0 ${history.length * (bar + gap) - gap} ${h}`}
      role="img"
      aria-label={label}
      className="inline-block align-middle"
    >
      <line x1="0" x2={history.length * (bar + gap) - gap} y1={h - 0.5} y2={h - 0.5} stroke="var(--border)" />
      {history.map((v, i) => {
        const x = i * (bar + gap);
        const current = i === history.length - 1;
        const title = `${formatPeriod(periods[i], locale)}: ${formatMetric(v, unit, locale)}`;
        if (v === null) {
          return (
            <circle key={i} cx={x + bar / 2} cy={h - 2} r={1.5} fill="var(--border-strong)">
              <title>{title}</title>
            </circle>
          );
        }
        const height = Math.max(2, (Math.abs(v) / max) * (h - 2));
        const y = h - height;
        const r = Math.min(3, height / 2);
        // Barra con las esquinas de arriba redondeadas y apoyada en la base.
        const d = `M${x},${h} V${y + r} Q${x},${y} ${x + r},${y} H${x + bar - r} Q${x + bar},${y} ${x + bar},${y + r} V${h} Z`;
        return (
          <path key={i} d={d} fill={current ? "currentColor" : "var(--border-strong)"}>
            <title>{title}</title>
          </path>
        );
      })}
    </svg>
  );
}

/** Une etiquetas: «a, b y c». */
function joinList(items: string[]) {
  return items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}

/**
 * Cuerpo del informe mensual (pantalla e impresión). Los datos salen solo de lo
 * registrado en el Hub: si falta un valor se muestra "sin dato", nunca una estimación.
 */
type Publications = NonNullable<Extract<View["sections"][number], { publications: unknown }>["publications"]>;

/** «12 publicadas y 2 programadas de 14 piezas del calendario · Post: 8 · Reel: 3». */
function PublicationSummary({ publications, plannedCount }: { publications: Publications; plannedCount: number }) {
  const published = publications.filter((p) => p.status === "published").length;
  const scheduled = publications.length - published;
  const byFormat = new Map<string, number>();
  for (const p of publications) byFormat.set(formatLabel(p.format), (byFormat.get(formatLabel(p.format)) ?? 0) + 1);
  return (
    <p className="text-sm">
      <span className="font-medium">
        {published === 1 ? "1 publicada" : `${published} publicadas`}
        {scheduled > 0 && (scheduled === 1 ? " y 1 programada" : ` y ${scheduled} programadas`)}
      </span>
      {plannedCount > 0 && (
        <span className="text-muted">
          {" "}
          de {plannedCount === 1 ? "1 pieza" : `${plannedCount} piezas`} del calendario del mes
        </span>
      )}
      <span className="text-muted">
        {[...byFormat].map(([format, n]) => ` · ${format}: ${n}`).join("")}
      </span>
    </p>
  );
}

export function ReportBody({
  view,
  tools,
  highlightTools,
  children,
}: {
  view: View;
  /** Edición de las cifras destacadas (solo en la página del informe). */
  highlightTools?: HighlightTools;
  /** Por id de sección: barra y formulario de edición en su sitio. */
  tools?: Record<string, SectionTools>;
  /** Tras la última sección (p. ej. «Añadir sección»). */
  children?: ReactNode;
}) {
  const { project, cycle, report, sections, highlights, plannedCount } = view;
  const tz = project.timezone;
  const locale = project.locale;
  const previousMonth = highlights[0]?.periods.at(-2);
  return (
    <article className="report flex flex-col gap-8">
      <header className="flex flex-col gap-1 border-b border-border pb-4">
        <div className="eyebrow">{project.clientName}</div>
        <h1 className="text-3xl font-semibold tracking-tight">
          Informe de {formatPeriod(cycle.period, project.locale).toLowerCase()}
        </h1>
        <div className="text-sm text-muted">{project.name}</div>
        {report.status !== "approved" && <p className="notice mt-2 font-medium">BORRADOR · pendiente de aprobación</p>}
      </header>

      {(highlights.length > 0 || highlightTools) && (
        <section aria-label="Cifras destacadas" className="flex flex-col gap-3">
          {highlights.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {highlights.map(({ id, channel, periods, row }) => (
                <div key={id} className="tile flex flex-col gap-1 break-inside-avoid">
                  <div className="text-xs text-muted">
                    {row.definition.label} · {channel.displayName}
                  </div>
                  <div className={`text-2xl font-semibold tabular-nums ${row.value === null ? "text-muted" : ""}`}>
                    {formatMetric(row.value, row.definition.unit, locale)}
                  </div>
                  <div className="text-xs text-muted">
                    {row.change !== null
                      ? `${formatChange(row.change, locale)} vs. ${formatPeriod(periods.at(-2)!, locale).split(" ")[0].toLowerCase()}`
                      : row.value !== null && previousMonth
                        ? "Sin dato del mes anterior"
                        : ""}
                  </div>
                  <Trend history={row.history} periods={periods} unit={row.definition.unit} locale={locale} />
                  {highlightTools?.remove[id]}
                </div>
              ))}
            </div>
          )}
          {highlightTools?.add}
        </section>
      )}

      {sections.map(({ section, ...data }) => (
        <section
          key={section.id}
          id={`seccion-${section.id}`}
          className={`report-section flex scroll-mt-24 flex-col gap-3 ${
            tools ? "-mx-3 rounded-lg border border-dashed border-border p-3 print:m-0 print:border-0 print:p-0" : ""
          }`}
        >
          {tools?.[section.id]?.bar}
          <h2 className="text-xl font-semibold tracking-tight">{section.title}</h2>

          {section.kind === "human_analysis" && (
            <div className="whitespace-pre-wrap leading-relaxed">{section.body?.trim() || "—"}</div>
          )}

          {section.kind === "ai_interpretation" && (
            <>
              <p className="text-xs text-muted">
                Texto redactado con ayuda de IA a partir de las métricas registradas
                {section.reviewedAt
                  ? ` y revisado por el equipo el ${formatInZone(section.reviewedAt, tz)}`
                  : " · PENDIENTE DE REVISIÓN"}
                .
              </p>
              <div className="whitespace-pre-wrap leading-relaxed">{section.body?.trim() || "—"}</div>
            </>
          )}

          {section.kind === "data" &&
            "metrics" in data &&
            data.metrics?.map(({ channel, hasPrevious, periods, rows }) => {
              const compare = section.comparePrevious && hasPrevious;
              // Por defecto solo las filas con algún valor; las demás se nombran debajo (nada se esconde).
              const shown = section.showEmptyMetrics
                ? rows
                : rows.filter((r) => r.value !== null || (compare && r.previous !== null));
              const hidden = rows.filter((r) => !shown.includes(r));
              const trend = shown.some((r) => r.history.filter((v) => v !== null).length >= 2);
              const sources = [...new Set(rows.flatMap((r) => (r.source ? [SOURCE_LABELS[r.source] ?? r.source] : [])))];
              return (
                <div key={channel.id} className="flex flex-col gap-2">
                  {data.metrics.length > 1 && <h3 className="font-medium">{channel.displayName}</h3>}
                  {shown.length === 0 ? (
                    <p className="text-muted">Sin métricas registradas de este canal este mes.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className={`table ${compare ? "min-w-[420px]" : ""}`}>
                        <thead>
                          <tr>
                            <th>Métrica</th>
                            <th className="text-right">Este mes</th>
                            {compare && <th className="text-right">Mes anterior</th>}
                            {compare && <th className="text-right">Variación</th>}
                            {trend && (
                              <th className="hidden text-right sm:table-cell print:table-cell">
                                Últimos {periods.length} meses
                              </th>
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {shown.map((r) => (
                            <tr key={r.definition.key}>
                              <td>{r.definition.label}</td>
                              <td className={`text-right ${r.value === null ? "text-muted" : "font-medium"}`}>
                                {formatMetric(r.value, r.definition.unit)}
                              </td>
                              {compare && (
                                <td className="text-right text-muted">{formatMetric(r.previous, r.definition.unit)}</td>
                              )}
                              {compare && <td className="text-right">{formatChange(r.change, locale)}</td>}
                              {trend && (
                                <td className="hidden text-right sm:table-cell print:table-cell">
                                  <Trend history={r.history} periods={periods} unit={r.definition.unit} locale={locale} />
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {(hidden.length > 0 || sources.length > 0) && (
                    <p className="text-xs text-muted">
                      {hidden.length > 0 &&
                        shown.length > 0 &&
                        `Sin dato este mes: ${joinList(hidden.map((r) => r.definition.label.toLowerCase()))}. `}
                      {sources.length > 0 && `Origen de los datos: ${joinList(sources).toLowerCase()}.`}
                    </p>
                  )}
                </div>
              );
            })}

          {section.kind === "publications" &&
            "publications" in data &&
            (data.publications && data.publications.length > 0 ? (
              <>
                <PublicationSummary publications={data.publications} plannedCount={plannedCount} />
                {/* En el móvil, una lista; en pantalla ancha y al imprimir, la tabla. */}
                <ul className="flex flex-col divide-y divide-border sm:hidden print:hidden">
                  {data.publications.map((p) => {
                    const date = p.publishedAt ?? p.scheduledAt;
                    return (
                      <li key={p.itemId} className="flex flex-col gap-0.5 py-2.5">
                        <span className="font-medium">
                          {p.externalUrl ? (
                            <a href={p.externalUrl} className="link" target="_blank" rel="noopener noreferrer">
                              {p.title}
                            </a>
                          ) : (
                            p.title
                          )}
                        </span>
                        <span className="text-sm text-muted">
                          {date ? formatInZone(date, tz) : "—"} · {p.channelName} · {formatLabel(p.format)} ·{" "}
                          {p.status === "published" ? "Publicada" : "Programada"}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                <div className="hidden overflow-x-auto sm:block print:block">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Pieza</th>
                        <th>Canal</th>
                        <th>Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.publications.map((p) => {
                        const date = p.publishedAt ?? p.scheduledAt;
                        return (
                          <tr key={p.itemId}>
                            <td className="whitespace-nowrap">{date ? formatInZone(date, tz) : "—"}</td>
                            <td>
                              {p.externalUrl ? (
                                <a href={p.externalUrl} className="link" target="_blank" rel="noopener noreferrer">
                                  {p.title}
                                </a>
                              ) : (
                                p.title
                              )}
                            </td>
                            <td>
                              {p.channelName} · {formatLabel(p.format)}
                            </td>
                            <td>{p.status === "published" ? "Publicada" : "Programada"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <p className="text-muted">No hay publicaciones registradas en este ciclo.</p>
            ))}
          {tools?.[section.id]?.editor}
        </section>
      ))}

      {children}

      <footer className="border-t border-border pt-3 text-xs text-muted">
        Las cifras son las registradas en Marketing Project Hub (a mano, por CSV o por integración). «Sin dato»
        significa que no se registró ese valor: no se estima.
        {report.approvedAt && ` Informe aprobado el ${formatInZone(report.approvedAt, tz)}.`}
      </footer>
    </article>
  );
}
