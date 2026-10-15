import { formatLabel } from "./formats";

// Mensaje para pegar en un chat de Claude con el conector de Metricool activado. El Hub no
// llama a Metricool: es la persona quien pega el mensaje, revisa el resultado en Metricool y
// lo programa allí. Por eso se pide crear la publicación como pendiente de revisión.

export type MetricoolHandoffInput = {
  brand: string;
  channelName: string;
  format: string;
  plannedAt: Date | null;
  timeZone: string;
  versionNo: number;
  body: string;
  linkUrl: string | null;
  assets: { kind: "file" | "link"; filename: string; url: string | null }[];
};

function fullDate(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function buildMetricoolHandoff(input: MetricoolHandoffInput): string {
  const when = input.plannedAt
    ? `para el ${fullDate(input.plannedAt, input.timeZone)} (hora de ${input.timeZone})`
    : "sin fecha: pregúntame la fecha y la hora antes de crearla";
  const files = input.assets.filter((a) => a.kind === "file").map((a) => `- ${a.filename}`);
  const links = input.assets.filter((a) => a.kind === "link" && a.url).map((a) => `- ${a.filename}: ${a.url}`);

  const lines = [
    "Usa el conector de Metricool.",
    `Crea esta publicación en la marca «${input.brand}», red ${input.channelName}, formato ${formatLabel(input.format)}, ${when}.`,
    "Déjala como pendiente de revisión: no la publiques ni la programes directamente.",
    "Si no encuentras la marca o la red, o algo no cuadra, pregúntame antes de crear nada.",
    "Copia el texto tal cual, sin cambiar ni una palabra.",
    "",
    `Texto (versión ${input.versionNo} aprobada en el Hub):`,
    "<<<",
    input.body,
    ">>>",
  ];
  if (input.linkUrl) lines.push("", `Enlace de destino: ${input.linkUrl}`);
  if (links.length > 0) lines.push("", "Material en enlaces:", ...links);
  if (files.length > 0) {
    lines.push("", "Archivos que añadiré yo en Metricool (no los tienes):", ...files);
  }
  return lines.join("\n");
}
