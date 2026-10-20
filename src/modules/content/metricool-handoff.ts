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

/** Una publicación dentro del mensaje del mes entero: la marca y la zona son comunes. */
export type MetricoolBulkPost = Omit<MetricoolHandoffInput, "brand" | "timeZone"> & { title: string };

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

function whenText(plannedAt: Date | null, timeZone: string): string {
  return plannedAt
    ? `para el ${fullDate(plannedAt, timeZone)} (hora de ${timeZone})`
    : "sin fecha: pregúntame la fecha y la hora antes de crearla";
}

/** Texto literal, enlace de destino y material de una publicación. */
function contentLines(input: Omit<MetricoolHandoffInput, "brand" | "timeZone">): string[] {
  const files = input.assets.filter((a) => a.kind === "file").map((a) => `- ${a.filename}`);
  const links = input.assets.filter((a) => a.kind === "link" && a.url).map((a) => `- ${a.filename}: ${a.url}`);
  const lines = [`Texto (versión ${input.versionNo} aprobada en el Hub):`, "<<<", input.body, ">>>"];
  if (input.linkUrl) lines.push("", `Enlace de destino: ${input.linkUrl}`);
  if (links.length > 0) lines.push("", "Material en enlaces:", ...links);
  if (files.length > 0) {
    lines.push("", "Archivos que añadiré yo en Metricool (no los tienes):", ...files);
  }
  return lines;
}

export function buildMetricoolHandoff(input: MetricoolHandoffInput): string {
  const lines = [
    "Usa el conector de Metricool.",
    `Crea esta publicación en la marca «${input.brand}», red ${input.channelName}, formato ${formatLabel(input.format)}, ${whenText(input.plannedAt, input.timeZone)}.`,
    "Déjala como pendiente de revisión: no la publiques ni la programes directamente.",
    "Si no encuentras la marca o la red, o algo no cuadra, pregúntame antes de crear nada.",
    "Copia el texto tal cual, sin cambiar ni una palabra.",
    "",
    ...contentLines(input),
  ];
  return lines.join("\n");
}

/** Mismo mensaje que `buildMetricoolHandoff`, pero con todas las publicaciones del mes de una vez. */
export function buildMetricoolBulkHandoff(input: {
  brand: string;
  timeZone: string;
  posts: MetricoolBulkPost[];
}): string {
  const total = input.posts.length;
  const lines = [
    "Usa el conector de Metricool.",
    `Crea estas ${total} publicaciones en la marca «${input.brand}», cada una en la red, el formato y la fecha que se indican.`,
    "Déjalas todas como pendientes de revisión: no publiques ni programes ninguna directamente.",
    "Si no encuentras la marca o alguna red, o algo no cuadra, pregúntame antes de crear nada.",
    "Copia cada texto tal cual, sin cambiar ni una palabra.",
    "Cuando termines, dame una lista con las que has creado y las que no, y por qué.",
  ];
  input.posts.forEach((post, i) => {
    lines.push(
      "",
      "---",
      "",
      `Publicación ${i + 1} de ${total}: ${post.title}`,
      `Red ${post.channelName}, formato ${formatLabel(post.format)}, ${whenText(post.plannedAt, input.timeZone)}.`,
      "",
      ...contentLines(post),
    );
  });
  return lines.join("\n");
}
