import { formatChange, formatMetric, SOURCE_LABELS } from "@/lib/format";
import { formatInZone, formatPeriod } from "@/lib/time";
import { formatLabel } from "@/modules/content/formats";
import type { getReportView } from "@/modules/reports/service";

type View = Awaited<ReturnType<typeof getReportView>>;

/**
 * Cuerpo del informe mensual (pantalla e impresión). Los datos salen solo de lo
 * registrado en el Hub: si falta un valor se muestra "sin dato", nunca una estimación.
 */
export function ReportBody({ view }: { view: View }) {
  const { project, cycle, report, sections } = view;
  const tz = project.timezone;
  return (
    <article className="report flex flex-col gap-8">
      <header className="flex flex-col gap-1 border-b border-border pb-4">
        <div className="text-sm text-muted">{project.clientName}</div>
        <h1 className="text-3xl font-semibold">Informe de {formatPeriod(cycle.period, project.locale).toLowerCase()}</h1>
        <div className="text-sm text-muted">{project.name}</div>
        {report.status !== "approved" && (
          <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">
            BORRADOR · pendiente de aprobación
          </p>
        )}
      </header>

      {sections.map(({ section, ...data }) => (
        <section key={section.id} className="report-section flex flex-col gap-3">
          <h2 className="text-xl font-semibold">{section.title}</h2>

          {section.kind === "human_analysis" && (
            <div className="whitespace-pre-wrap leading-relaxed">{section.body?.trim() || "—"}</div>
          )}

          {section.kind === "data" &&
            "metrics" in data &&
            data.metrics?.map(({ channel, hasPrevious, rows }) => (
              <div key={channel.id} className="flex flex-col gap-2">
                {data.metrics.length > 1 && <h3 className="font-medium">{channel.displayName}</h3>}
                <table className="table">
                  <thead>
                    <tr>
                      <th>Métrica</th>
                      <th className="text-right">Este mes</th>
                      {section.comparePrevious && hasPrevious && <th className="text-right">Mes anterior</th>}
                      {section.comparePrevious && hasPrevious && <th className="text-right">Variación</th>}
                      <th>Fuente</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.definition.key}>
                        <td>{r.definition.label}</td>
                        <td className={`text-right ${r.value === null ? "text-muted" : "font-medium"}`}>
                          {formatMetric(r.value, r.definition.unit)}
                        </td>
                        {section.comparePrevious && hasPrevious && (
                          <td className="text-right text-muted">{formatMetric(r.previous, r.definition.unit)}</td>
                        )}
                        {section.comparePrevious && hasPrevious && (
                          <td className="text-right">{formatChange(r.change)}</td>
                        )}
                        <td className="text-muted">{r.source ? SOURCE_LABELS[r.source] : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}

          {section.kind === "publications" &&
            "publications" in data &&
            (data.publications && data.publications.length > 0 ? (
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
            ) : (
              <p className="text-muted">No hay publicaciones registradas en este ciclo.</p>
            ))}
        </section>
      ))}

      <footer className="border-t border-border pt-3 text-xs text-muted">
        Las cifras son las registradas en Marketing Project Hub con su fuente (manual, CSV o integración). «Sin dato»
        significa que no se registró ese valor: no se estima.
        {report.approvedAt && ` Informe aprobado el ${formatInZone(report.approvedAt, tz)}.`}
      </footer>
    </article>
  );
}
