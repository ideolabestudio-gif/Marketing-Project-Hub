import { PLATFORMS } from "@/modules/projects/catalog";

// Petición para pegar en un chat de Claude con el conector de Metricool: pide los datos del
// mes de cada red en un CSV que el importador del Hub entiende (columnas con el nombre de
// cada métrica del catálogo, una fila por día). El Hub no llama a Metricool: la persona pega
// el texto, y el CSV entra por el importador, donde se revisan las columnas antes de aplicar.

export type MetricsRequestInput = {
  brand: string;
  projectId: string;
  period: string;
  monthLabel: string;
  channels: { id: string; displayName: string; platform: string; handle: string | null }[];
  /** Nombres de las métricas de redes del catálogo, en su orden. */
  metricLabels: string[];
};

function lastDay(period: string): number {
  const [y, m] = period.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function buildMetricsRequest(input: MetricsRequestInput): string {
  const month = input.monthLabel.toLocaleLowerCase("es-ES");
  const channels = input.channels.map((c) => {
    const platform = PLATFORMS[c.platform as keyof typeof PLATFORMS]?.label ?? c.platform;
    const handle = c.handle ? ` ${c.handle}` : "";
    return `- ${c.displayName} (${platform}${handle}) · canal_id: ${c.id}`;
  });
  return [
    "Usa el conector de Metricool.",
    `Necesito las métricas de ${month} (del 1 al ${lastDay(input.period)}) de la marca «${input.brand}» para el informe mensual.`,
    "",
    "Para cada red de la lista, prepara un CSV con una fila por día y estas columnas, con estos nombres exactos:",
    ["Fecha", ...input.metricLabels].join(", "),
    "",
    "- Usa solo cifras que te dé Metricool. Si una métrica no está disponible, deja la columna vacía: no la estimes ni la calcules.",
    "- Escribe los números sin separador de miles y con punto decimal.",
    "- Si no encuentras la marca o alguna red, pregúntame antes de seguir.",
    "",
    "Redes:",
    ...channels,
    "",
    `Después, si tienes el conector del Marketing Project Hub, sube cada CSV con la herramienta subir_csv_metricas (proyecto_id: ${input.projectId}, periodo: ${input.period} y el canal_id de cada red). Si no lo tienes, dame cada CSV para descargarlo y lo subo yo.`,
    "No hagas nada más: las columnas las reviso y las aplico yo en el Hub.",
  ].join("\n");
}
