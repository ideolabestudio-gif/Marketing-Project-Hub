// Mensaje para pegar en un chat de Claude con el conector de MailerLite. El Hub no llama a
// MailerLite: la persona pega el mensaje y Claude deja la campaña como borrador. Revisarla,
// elegir los destinatarios, programarla y enviarla se hace siempre a mano en MailerLite.

export type MailerLiteHandoffInput = {
  brand: string;
  /** Nombre del canal en el Hub (la lista o el grupo de MailerLite que lleva). */
  channelName: string;
  handle: string | null;
  title: string;
  plannedAt: Date | null;
  timeZone: string;
  versionNo: number;
  subject: string | null;
  preheader: string | null;
  body: string;
  linkUrl: string | null;
};

function when(plannedAt: Date | null, timeZone: string): string {
  if (!plannedAt) return "Todavía no tiene fecha de envío.";
  const date = new Intl.DateTimeFormat("es-ES", {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(plannedAt);
  return `Está previsto enviarla el ${date} (hora de ${timeZone}); no la programes, solo es para que lo sepas.`;
}

export function buildMailerLiteHandoff(input: MailerLiteHandoffInput): string {
  const list = input.handle ? `${input.channelName} (${input.handle})` : input.channelName;
  const lines = [
    "Usa el conector de MailerLite.",
    `Crea una campaña de email como BORRADOR para «${input.brand}», con el nombre «${input.title}».`,
    "No la programes ni la envíes, y no elijas destinatarios: eso lo hago yo en MailerLite después de revisarla.",
    `Es para la lista o el grupo que en el Hub se llama ${list}; si no lo ves claro, no pasa nada, déjalo sin destinatarios.`,
    when(input.plannedAt, input.timeZone),
    "Copia el asunto, el preencabezado y el texto tal cual, sin cambiar ni una palabra.",
    "Si no puedes crear la campaña como borrador o algo no cuadra, dímelo en lugar de hacer otra cosa.",
    "",
    `Asunto: ${input.subject || "(sin asunto: pregúntamelo)"}`,
    `Preencabezado: ${input.preheader || "(ninguno)"}`,
    "",
    `Texto (versión ${input.versionNo} aprobada en el Hub):`,
    "<<<",
    input.body,
    ">>>",
  ];
  if (input.linkUrl) lines.push("", `Enlace principal: ${input.linkUrl}`);
  return lines.join("\n");
}
