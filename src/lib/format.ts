/** Formato de números para pantalla e informes (es-ES por defecto). */

export type MetricUnit = "count" | "percent" | "currency" | "seconds";

export function formatMetric(value: number | null, unit: MetricUnit, locale = "es-ES"): string {
  if (value === null) return "sin dato";
  const n = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  switch (unit) {
    case "percent":
      return `${n.format(value)} %`;
    case "currency":
      return new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(value);
    case "seconds":
      return `${n.format(value)} s`;
    default:
      return n.format(value);
  }
}

export function formatChange(change: number | null, locale = "es-ES"): string {
  if (change === null) return "—";
  const n = new Intl.NumberFormat(locale, { maximumFractionDigits: 1, signDisplay: "exceptZero" });
  return `${n.format(change)} %`;
}

export const UNIT_LABELS: Record<MetricUnit, string> = {
  count: "Número",
  percent: "Porcentaje",
  currency: "Euros",
  seconds: "Segundos",
};

export const SOURCE_LABELS: Record<string, string> = {
  manual: "Manual",
  csv_import: "CSV",
  integration: "Integración",
};
