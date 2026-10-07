import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { orNotFound, projectContextForPage } from "@/lib/project-page";
import { formatInZone } from "@/lib/time";
import { hasPermission } from "@/modules/access/context";
import { AGGREGATIONS, NUMBER_FORMAT_LABELS, NUMBER_FORMATS } from "@/modules/metrics/csv";
import { getMetricImport } from "@/modules/metrics/service";
import { getCycleByPeriod } from "@/modules/cycles/service";
import { getProject } from "@/modules/projects/service";
import { applyImportAction, discardImportAction } from "../../actions";

export default async function ImportPage({
  params,
}: PageProps<"/p/[projectId]/ciclos/[period]/metricas/importar/[importId]">) {
  const { projectId, period, importId } = await params;
  const ctx = await projectContextForPage(projectId);
  const cycle = await orNotFound(getCycleByPeriod(ctx, period));
  const data = await orNotFound(getMetricImport(ctx, importId));
  if (data.import.cycleId !== cycle.id) notFound();
  const project = await getProject(ctx);
  const imp = data.import;
  const pending = imp.status === "pending";
  const canWrite = hasPermission(ctx, "metrics.write") && cycle.status !== "closed" && pending;
  const back = `/p/${projectId}/ciclos/${period}/metricas`;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={back} className="link text-sm">
          ← Métricas del mes
        </Link>
        <h1 className="h1 mt-1">Importación: {imp.filename}</h1>
        <div className="mt-2 flex flex-wrap gap-2">
          <span className="badge">{data.channel.displayName}</span>
          <span className="badge">{imp.rowCount} filas</span>
          <span className="badge">Subido {formatInZone(imp.createdAt, project.timezone)}</span>
          <span className="badge">
            {pending ? "Pendiente" : imp.status === "applied" ? "Aplicada" : "Descartada"}
          </span>
        </div>
      </div>

      <section className="card flex flex-col gap-3">
        <h2 className="h2">Vista previa</h2>
        <p className="text-sm text-muted">
          Primeras {data.previewRows.length} filas de {imp.rowCount}. El archivo original se guarda sin cambios.
        </p>
        <div className="overflow-x-auto">
          <table className="table text-xs">
            <thead>
              <tr>
                {data.headers.map((h, i) => (
                  <th key={i}>{h || `Columna ${i + 1}`}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.previewRows.map((row, i) => (
                <tr key={i}>
                  {data.headers.map((_, j) => (
                    <td key={j} className="whitespace-nowrap">
                      {row[j] ?? ""}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {canWrite && (
        <section className="card flex flex-col gap-3">
          <h2 className="h2">Asignar columnas</h2>
          <p className="text-sm text-muted">
            Elige de qué columna sale cada métrica y cómo se resumen las filas (por ejemplo, «suma» para alcance diario,
            «última fila» para seguidores). Deja «—» en las métricas que el archivo no trae: quedarán «sin dato». Las
            propuestas se basan solo en el nombre de la columna; revísalas.
          </p>
          <ActionForm
            action={applyImportAction.bind(
              null,
              projectId,
              imp.id,
              period,
              data.suggestions.map((s) => s.definition.key),
            )}
            submitLabel="Aplicar importación"
            className="grid gap-3"
          >
            <label className="field max-w-xs">
              Formato de los números
              <select name="numberFormat" className="input" defaultValue={data.suggestedFormat}>
                {NUMBER_FORMATS.map((f) => (
                  <option key={f} value={f}>
                    {NUMBER_FORMAT_LABELS[f]}
                  </option>
                ))}
              </select>
            </label>
            <table className="table">
              <thead>
                <tr>
                  <th>Métrica</th>
                  <th>Columna del CSV</th>
                  <th>Cómo resumir las filas</th>
                </tr>
              </thead>
              <tbody>
                {data.suggestions.map(({ definition: d, column, aggregation }) => (
                  <tr key={d.key}>
                    <td title={d.description}>{d.label}</td>
                    <td>
                      <select
                        name={`column:${d.key}`}
                        className="input"
                        defaultValue={column === null ? "" : String(column)}
                        aria-label={`Columna para ${d.label}`}
                      >
                        <option value="">—</option>
                        {data.headers.map((h, i) => (
                          <option key={i} value={i}>
                            {h || `Columna ${i + 1}`}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select
                        name={`aggregation:${d.key}`}
                        className="input"
                        defaultValue={aggregation}
                        aria-label={`Resumen para ${d.label}`}
                      >
                        {AGGREGATIONS.map((a) => (
                          <option key={a} value={a}>
                            {data.aggregationLabels[a]}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ActionForm>
          <ActionForm action={discardImportAction.bind(null, projectId, imp.id, period)} submitLabel="Descartar importación" variant="danger">
            <span className="text-sm text-muted">Si el archivo no era el correcto:</span>
          </ActionForm>
        </section>
      )}
    </div>
  );
}
