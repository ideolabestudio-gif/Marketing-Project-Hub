import Link from "next/link";
import { Breadcrumbs, cycleCrumbs } from "@/components/breadcrumbs";
import { ActionForm } from "@/components/action-form";
import { CopyButton } from "@/components/copy-button";
import { FileInput } from "@/components/file-input";
import { formatMetric, SOURCE_LABELS } from "@/lib/format";
import { orNotFound, projectContextForPage } from "@/lib/project-page";
import { formatInZone, formatPeriod } from "@/lib/time";
import { hasPermission } from "@/modules/access/context";
import { CHANNEL_KIND_LABELS } from "@/modules/content/formats";
import { NUMBER_FORMAT_LABELS, NUMBER_FORMATS } from "@/modules/metrics/csv";
import { buildMetricsRequest } from "@/modules/metrics/claude-request";
import { getCycleMetrics } from "@/modules/metrics/service";
import { getCycleByPeriod } from "@/modules/cycles/service";
import { getProject } from "@/modules/projects/service";
import { recordValueAction, uploadCsvAction } from "./actions";

import type { Metadata } from "next";
import { cycleTitle } from "@/lib/page-title";

export async function generateMetadata({ params }: PageProps<"/p/[projectId]/ciclos/[period]/metricas">): Promise<Metadata> {
  const { projectId, period } = await params;
  return cycleTitle(projectId, period, "Métricas");
}

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
  const monthLabel = formatPeriod(cycle.period, project.locale);
  const pendingImports = data.imports.filter((i) => i.status === "pending");
  const socialChannels = channels.filter((c) => c.isActive && c.kind === "social");
  const request =
    socialChannels.length > 0
      ? buildMetricsRequest({
          brand: project.clientName,
          projectId,
          period: cycle.period,
          monthLabel,
          channels: socialChannels,
          metricLabels: data.definitions.filter((d) => d.kind === "social" && d.isActive).map((d) => d.label),
        })
      : null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Breadcrumbs help="metricas" items={cycleCrumbs(projectId, project.name, period, monthLabel)} />
        <h1 className="h1 mt-1">Métricas del mes</h1>
        <p className="mt-1 text-sm text-muted">
          Solo se guardan datos registrados por una persona o importados de un archivo, siempre con su fuente. Si falta
          un dato, el informe muestra «sin dato».
        </p>
        {cycle.status === "closed" && <p className="mt-2 badge">Ciclo cerrado · solo lectura</p>}
      </div>

      {pendingImports.length > 0 && (
        <p className="notice">
          {pendingImports.length === 1
            ? "Hay 1 importación esperando a que asignes sus columnas: hasta entonces no cuenta."
            : `Hay ${pendingImports.length} importaciones esperando a que asignes sus columnas: hasta entonces no cuentan.`}{" "}
          {pendingImports.map((imp, i) => (
            <span key={imp.id}>
              {i > 0 && " · "}
              <Link href={`${base}/metricas/importar/${imp.id}`} className="link">
                {imp.filename}
              </Link>
            </span>
          ))}
        </p>
      )}

      {canWrite && channels.some((c) => c.isActive) && (
        <section id="traer" className="card flex flex-col gap-4" aria-labelledby="traer-titulo">
          <div>
            <h2 id="traer-titulo" className="h2">
              Traer las métricas de {monthLabel.toLocaleLowerCase(project.locale)}
            </h2>
            <p className="mt-1 text-sm text-muted">Tres caminos; usa el que te venga mejor para cada canal.</p>
          </div>
          <ol className="flex flex-col gap-4">
            {request && (
              <li className="tile flex flex-col gap-3">
                <h3 className="font-medium">1. Pedírselas a Claude (redes, desde Metricool)</h3>
                <p className="text-sm">
                  Copia esta petición y pégala en un chat de Claude con el conector de Metricool. Si también tiene el
                  conector del Hub, Claude subirá un CSV por red y aparecerá aquí abajo en «Importaciones»; si no, te dará
                  los CSV para subirlos en el paso 2. Después solo tienes que revisar las columnas y aplicar.
                </p>
                <details className="text-sm">
                  <summary>Ver la petición</summary>
                  <pre className="mt-2 max-h-64 overflow-auto rounded-lg border border-border bg-surface p-3 text-xs whitespace-pre-wrap">
                    {request}
                  </pre>
                </details>
                <CopyButton text={request} label="Copiar petición para Claude" />
              </li>
            )}
            <li className="tile flex flex-col gap-3">
              <h3 className="font-medium">{request ? "2." : "1."} Subir un CSV</h3>
              <p className="text-sm text-muted">
                La exportación de Metricool o MailerLite, el informe de Ingresos de WooCommerce o una hoja de cálculo. En el
                paso siguiente eliges qué columna corresponde a cada métrica y cómo se resumen las filas. El archivo
                original se conserva.
              </p>
              <ActionForm
                action={uploadCsvAction.bind(null, projectId, cycle.id, period)}
                submitLabel="Subir CSV"
                className="flex flex-wrap items-end gap-3"
              >
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
                <label className="field min-w-0 grow basis-64">
                  Archivo
                  <FileInput name="file" accept=".csv,text/csv,text/plain" required />
                </label>
              </ActionForm>
            </li>
            <li className="tile flex flex-col gap-1">
              <h3 className="font-medium">{request ? "3." : "2."} A mano</h3>
              <p className="text-sm text-muted">
                En la tarjeta de cada canal, más abajo, abre «Registrar o corregir un valor a mano».
              </p>
            </li>
          </ol>
        </section>
      )}

      <section className="card flex flex-col gap-3">
        <h2 className="h2">Importaciones de este mes</h2>
        {data.imports.length === 0 ? (
          <p className="text-sm text-muted">No hay importaciones en este ciclo.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table min-w-[560px]">
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
                    <td>
                      <span className="badge">{IMPORT_STATUS_LABELS[imp.status]}</span>
                    </td>
                    <td className="whitespace-nowrap">{formatInZone(imp.createdAt, tz)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {channels.length === 0 && <p className="text-sm text-muted">Este proyecto no tiene canales configurados.</p>}

      {channels.map((channel) => {
        const defs = data.definitions.filter(
          (d) =>
            d.kind === channel.kind &&
            (d.isActive || data.values.some((v) => v.channelId === channel.id && v.metricKey === d.key)),
        );
        const values = data.values.filter((v) => v.channelId === channel.id && !v.contentItemId);
        const current = (key: string) => values.find((v) => v.metricKey === key && v.isCurrent);
        const history = values.filter((v) => !v.isCurrent);
        return (
          <section
            key={channel.id}
            className="card flex flex-col gap-4"
            aria-label={`Métricas de ${channel.displayName}`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="h2">{channel.displayName}</h2>
              <div className="flex flex-wrap gap-2">
                <span className="badge">{CHANNEL_KIND_LABELS[channel.kind]}</span>
                <span className="badge">
                  {defs.filter((d) => current(d.key)).length} de {defs.length} con dato
                </span>
              </div>
            </div>
            {/* En el móvil, una ficha por métrica en vez de una tabla que obliga a desplazarse. */}
            <ul className="flex flex-col divide-y divide-border sm:hidden">
              {defs.map((d) => {
                const v = current(d.key);
                return (
                  <li key={d.key} className="flex flex-col gap-0.5 py-2">
                    <div className="flex items-baseline justify-between gap-3">
                      <span>{d.label}</span>
                      <span className={`tabular-nums ${v ? "font-medium" : "text-muted"}`}>
                        {formatMetric(v ? v.value : null, d.unit)}
                      </span>
                    </div>
                    {v && (
                      <span className="text-xs text-muted">
                        {SOURCE_LABELS[v.source]}
                        {v.sourceDetail && ` · ${v.sourceDetail}`} · {v.capturedByName} ·{" "}
                        {formatInZone(v.capturedAt, tz)}
                        {v.note && ` · Motivo: ${v.note}`}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
            <div className="hidden overflow-x-auto sm:block">
              <table className="table min-w-[560px]">
                <thead>
                  <tr>
                    <th>Métrica</th>
                    <th className="text-right">Valor</th>
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
                        <td className={`pr-8 text-right tabular-nums ${v ? "font-medium" : "text-muted"}`}>
                          {formatMetric(v ? v.value : null, d.unit)}
                        </td>
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
            </div>

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
              <details className="text-sm">
                <summary>Registrar o corregir un valor a mano</summary>
                <ActionForm
                  action={recordValueAction.bind(null, projectId, cycle.id, channel.id)}
                  submitLabel="Registrar valor"
                  variant="secondary"
                  className="tile mt-2 flex flex-wrap items-end gap-3"
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
                  <label className="field min-w-0 grow basis-56">
                    Motivo (obligatorio si corriges un valor)
                    <input name="note" className="input" />
                  </label>
                </ActionForm>
              </details>
            )}
          </section>
        );
      })}

    </div>
  );
}
