import type { ReactNode } from "react";
import { formatChange, formatMetric, SOURCE_LABELS } from "@/lib/format";
import { formatInZone, formatPeriod } from "@/lib/time";
import { formatLabel } from "@/modules/content/formats";
import type { getReportView } from "@/modules/reports/service";

type View = Awaited<ReturnType<typeof getReportView>>;

/** Controles de edición de una sección (solo en la página del informe, nunca al imprimir). */
export type SectionTools = { bar?: ReactNode; editor?: ReactNode };

/** Une etiquetas: «a, b y c». */
function joinList(items: string[]) {
  return items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}

/**
 * Cuerpo del informe mensual (pantalla e impresión). Los datos salen solo de lo
 * registrado en el Hub: si falta un valor se muestra "sin dato", nunca una estimación.
 */
export function ReportBody({
  view,
  tools,
  children,
}: {
  view: View;
  /** Por id de sección: barra y formulario de edición en su sitio. */
  tools?: Record<string, SectionTools>;
  /** Tras la última sección (p. ej. «Añadir sección»). */
  children?: ReactNode;
}) {
  const { project, cycle, report, sections } = view;
  const tz = project.timezone;
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
            data.metrics?.map(({ channel, hasPrevious, rows }) => {
              const compare = section.comparePrevious && hasPrevious;
              // Por defecto solo las filas con algún valor; las demás se nombran debajo (nada se esconde).
              const shown = section.showEmptyMetrics
                ? rows
                : rows.filter((r) => r.value !== null || (compare && r.previous !== null));
              const hidden = rows.filter((r) => !shown.includes(r));
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
                              {compare && <td className="text-right">{formatChange(r.change)}</td>}
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
