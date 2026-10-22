import { ActionForm } from "@/components/action-form";
import { CollapsibleCard } from "@/components/collapsible-card";
import { formatMetric, SOURCE_LABELS } from "@/lib/format";
import { formatInZone } from "@/lib/time";
import { NUMBER_FORMAT_LABELS, NUMBER_FORMATS } from "@/modules/metrics/csv";
import type { getItemMetrics } from "@/modules/metrics/service";
import { recordItemMetricAction } from "./actions";

type Props = {
  projectId: string;
  itemId: string;
  data: Awaited<ReturnType<typeof getItemMetrics>>;
  tz: string;
  canWrite: boolean;
  /** Abierta si la pieza ya está publicada (es cuando toca apuntar sus cifras). */
  published: boolean;
};

/**
 * Métricas de esta publicación (alcance de un post, aperturas de un email…). Solo las
 * registra una persona con la cifra de Metricool o MailerLite: nunca se estiman.
 */
export function ItemMetricsSection({ projectId, itemId, data, tz, canWrite, published }: Props) {
  const current = data.values.filter((v) => v.isCurrent);
  const history = data.values.filter((v) => !v.isCurrent);
  const active = data.definitions.filter((d) => d.isActive);
  return (
    <CollapsibleCard
      id="metricas-pieza"
      title="Métricas de la publicación"
      hint={
        current.length > 0
          ? `${current.length} ${current.length === 1 ? "métrica registrada" : "métricas registradas"}`
          : "Las cifras de este post o email, cuando ya se haya publicado."
      }
      defaultOpen={published && current.length === 0 && canWrite}
    >
      <div className="flex flex-col gap-4">
        {current.length === 0 ? (
          <p className="text-sm text-muted">Sin datos. El Hub no calcula ni estima cifras: se apuntan desde Metricool o MailerLite.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border text-sm">
            {current.map((v) => {
              const d = data.definitions.find((x) => x.key === v.metricKey);
              return (
                <li key={v.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2">
                  <span>{d?.label ?? v.metricKey}</span>
                  <span className="font-medium tabular-nums">{d ? formatMetric(v.value, d.unit) : v.value}</span>
                  <span className="w-full text-xs text-muted">
                    {SOURCE_LABELS[v.source]} · {v.capturedByName} · {formatInZone(v.capturedAt, tz)}
                    {v.note && ` · Motivo: ${v.note}`}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {history.length > 0 && (
          <details className="text-sm">
            <summary>Historial de correcciones ({history.length})</summary>
            <ul className="mt-2 flex flex-col gap-1 text-muted">
              {history.map((v) => {
                const d = data.definitions.find((x) => x.key === v.metricKey);
                return (
                  <li key={v.id}>
                    <span className="line-through">
                      {d?.label ?? v.metricKey}: {d ? formatMetric(v.value, d.unit) : v.value}
                    </span>{" "}
                    · {v.capturedByName} · {formatInZone(v.capturedAt, tz)}
                  </li>
                );
              })}
            </ul>
          </details>
        )}
        {canWrite && active.length > 0 && (
          <ActionForm
            action={recordItemMetricAction.bind(null, projectId, itemId)}
            submitLabel="Registrar valor"
            variant="secondary"
            className="tile flex flex-wrap items-end gap-3"
          >
            <label className="field">
              Métrica
              <select name="metricKey" className="input" required>
                {active.map((d) => (
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
        )}
      </div>
    </CollapsibleCard>
  );
}
