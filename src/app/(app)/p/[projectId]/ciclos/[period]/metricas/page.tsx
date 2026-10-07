import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { formatMetric, SOURCE_LABELS } from "@/lib/format";
import { orNotFound, projectContextForPage } from "@/lib/project-page";
import { formatInZone, formatPeriod } from "@/lib/time";
import { hasPermission } from "@/modules/access/context";
import { NUMBER_FORMAT_LABELS, NUMBER_FORMATS } from "@/modules/metrics/csv";
import { getCycleMetrics } from "@/modules/metrics/service";
import { getCycleByPeriod } from "@/modules/cycles/service";
import { getProject } from "@/modules/projects/service";
import { recordValueAction, uploadCsvAction } from "./actions";

const IMPORT_STATUS_LABELS = { pending: "Pendiente de asignar columnas", applied: "Aplicada", discarded: "Descartada" };

export default async function MetricsPage({ params }: PageProps<"/p/[projectId]/ciclos/[period]/metricas">) {
  const { projectId, period } = await params;
  const ctx = await projectContextForPage(projectId);
  const cycle = await orNotFound(getCycleByPeriod(ctx, period));
  const [project, data] = await Promise.all([getProject(ctx), getCycleMetrics(ctx, cycle.id)]);
  const tz = project.timezone;
  const canWrite = hasPermission(ctx, "metrics.write") && cycle.status !== "closed";
  const base = `/p/${projectId}/ciclos/${period}`;
  const channels = data.channels.filter((c) => c.isActive || data.values.some((v) => v.channelId === c.id));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={base} className="link text-sm">
          ← {formatPeriod(cycle.period, project.locale)}
        </Link>
        <h1 className="h1 mt-1">Métricas del mes</h1>
        <p className="mt-1 text-sm text-muted">
          Solo se guardan datos registrados por una persona o importados de un archivo, siempre con su fuente. Si falta
          un dato, el informe muestra «sin dato».
        </p>
        {cycle.status === "closed" && <p className="mt-2 badge">Ciclo cerrado · solo lectura</p>}
      </div>

      {channels.length === 0 && <p className="text-sm text-muted">Este proyecto no tiene canales configurados.</p>}

      {channels.map((channel) => {
        const defs = data.definitions.filter(
          (d) => d.kind === channel.kind && (d.isActive || data.values.some((v) => v.channelId === channel.id && v.metricKey === d.key)),
        );
        const values = data.values.filter((v) => v.channelId === channel.id && !v.contentItemId);
        const current = (key: string) => values.find((v) => v.metricKey === key && v.isCurrent);
        const history = values.filter((v) => !v.isCurrent);
        return (
          <section key={channel.id} className="card flex flex-col gap-4" aria-label={`Métricas de ${channel.displayName}`}>
            <h2 className="h2">
              {channel.displayName} <span className="text-sm font-normal text-muted">· {channel.kind === "email" ? "Email" : "Redes"}</span>
            </h2>
            <table className="table">
              <thead>
                <tr>
                  <th>Métrica</th>
                  <th>Valor</th>
                  <th>Fuente</th>
                  <th>Registrado</th>
                </tr>
              </thead>
              <tbody>
                {defs.map((d) => {
                  const v = current(d.key);
                  return (
                    <tr key={d.key}>
                      <td title={d.description}>{d.label}</td>
                      <td className={v ? "font-medium" : "text-muted"}>{formatMetric(v ? v.value : null, d.unit)}</td>
                      <td className="text-sm">
                        {v ? (
                          <>
                            {SOURCE_LABELS[v.source]}
                            {v.sourceDetail && <div className="text-xs text-muted">{v.sourceDetail}</div>}
                            {v.note && <div className="text-xs text-muted">Motivo: {v.note}</div>}
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="text-sm whitespace-nowrap">
                        {v ? (
                          <>
                            {v.capturedByName}
                            <div className="text-xs text-muted">{formatInZone(v.capturedAt, tz)}</div>
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {history.length > 0 && (
              <details className="text-sm">
                <summary className="cursor-pointer">Historial de correcciones ({history.length})</summary>
                <ul className="mt-2 flex flex-col gap-1">
                  {history.map((v) => {
                    const d = data.definitions.find((x) => x.key === v.metricKey);
                    return (
                      <li key={v.id} className="text-muted">
                        <span className="line-through">
                          {d?.label ?? v.metricKey}: {d ? formatMetric(v.value, d.unit) : v.value}
                        </span>{" "}
                        · {SOURCE_LABELS[v.source]} · {v.capturedByName} · {formatInZone(v.capturedAt, tz)}
                      </li>
                    );
                  })}
                </ul>
              </details>
            )}

            {canWrite && defs.some((d) => d.isActive) && (
              <ActionForm
                action={recordValueAction.bind(null, projectId, cycle.id, channel.id)}
                submitLabel="Registrar valor"
                variant="secondary"
              >
                <label className="field">
                  Métrica
                  <select name="metricKey" className="input" required>
                    {defs
                      .filter((d) => d.isActive)
                      .map((d) => (
                        <option key={d.key} value={d.key}>
                          {d.label}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="field">
                  Valor
                  <input name="value" className="input w-32" inputMode="decimal" required />
                </label>
                <label className="field">
                  Formato
                  <select name="numberFormat" className="input" defaultValue="es">
                    {NUMBER_FORMATS.map((f) => (
                      <option key={f} value={f}>
                        {NUMBER_FORMAT_LABELS[f]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field grow">
                  Motivo (obligatorio si corriges un valor)
                  <input name="note" className="input" />
                </label>
              </ActionForm>
            )}
          </section>
        );
      })}

      <section className="card flex flex-col gap-3">
        <h2 className="h2">Importar desde CSV</h2>
        {canWrite && channels.some((c) => c.isActive) && (
          <>
            <p className="text-sm text-muted">
              Sube la exportación (Metricool, MailerLite, una hoja de cálculo…). En el paso siguiente eliges qué columna
              corresponde a cada métrica y cómo se resumen las filas. El archivo original se conserva.
            </p>
            <ActionForm action={uploadCsvAction.bind(null, projectId, cycle.id, period)} submitLabel="Subir CSV">
              <label className="field">
                Canal
                <select name="channelId" className="input" required>
                  {channels
                    .filter((c) => c.isActive)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.displayName}
                      </option>
                    ))}
                </select>
              </label>
              <label className="field">
                Archivo
                <input type="file" name="file" accept=".csv,text/csv,text/plain" className="input" required />
              </label>
            </ActionForm>
          </>
        )}
        {data.imports.length === 0 ? (
          <p className="text-sm text-muted">No hay importaciones en este ciclo.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Archivo</th>
                <th>Canal</th>
                <th>Filas</th>
                <th>Estado</th>
                <th>Subido</th>
              </tr>
            </thead>
            <tbody>
              {data.imports.map((imp) => (
                <tr key={imp.id}>
                  <td>
                    <Link href={`${base}/metricas/importar/${imp.id}`} className="link">
                      {imp.filename}
                    </Link>
                  </td>
                  <td>{data.channels.find((c) => c.id === imp.channelId)?.displayName}</td>
                  <td>{imp.rowCount}</td>
                  <td>{IMPORT_STATUS_LABELS[imp.status]}</td>
                  <td className="whitespace-nowrap">{formatInZone(imp.createdAt, tz)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
