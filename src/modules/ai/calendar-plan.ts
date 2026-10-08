import { z } from "zod";
import { periodOfWallTime, wallTimeToUtc } from "@/lib/time";
import { FORMATS, isValidFormat, type ChannelKind } from "@/modules/content/formats";

/**
 * Propuesta de calendario de la IA: una lista de piezas con canal, formato, fecha y
 * título. En el prompt cada canal activo se identifica con una referencia corta (C1,
 * C2…) que corresponde, por orden, a `inputRefs.channel` de la generación; así la
 * propuesta guardada se puede leer siempre igual, aunque luego cambien los canales.
 *
 * Nada de esto crea piezas: solo se leen y se validan para que una persona elija.
 */

export function channelRef(index: number): string {
  return `C${index + 1}`;
}

const ALL_FORMATS = [...new Set(Object.values(FORMATS).flatMap((group) => Object.keys(group)))];

/** Esquema de la salida estructurada que se pide al proveedor. */
export function calendarPlanJsonSchema(channelCount: number): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      pieces: {
        type: "array",
        items: {
          type: "object",
          properties: {
            channel: { type: "string", enum: Array.from({ length: channelCount }, (_, i) => channelRef(i)) },
            format: { type: "string", enum: ALL_FORMATS },
            date: { type: "string", description: "Fecha y hora en la zona del proyecto: AAAA-MM-DDTHH:mm" },
            title: { type: "string" },
            idea: { type: "string" },
          },
          required: ["channel", "format", "date", "title", "idea"],
          additionalProperties: false,
        },
      },
    },
    required: ["pieces"],
    additionalProperties: false,
  };
}

const pieceSchema = z.object({
  channel: z.string(),
  format: z.string(),
  date: z.string(),
  title: z.string(),
  idea: z.string(),
});

export type PlanChannel = { id: string; displayName: string; kind: ChannelKind; isActive: boolean };

export type CalendarProposal = {
  /** Posición en la respuesta de la IA (identifica la propuesta al añadirla). */
  index: number;
  channelId: string;
  channelName: string;
  format: string;
  /** Hora de pared del proyecto, AAAA-MM-DDTHH:mm. */
  plannedAt: string;
  title: string;
  idea: string;
};

/**
 * Lee la respuesta guardada y descarta lo que no encaja: canal desconocido o
 * desactivado, formato que no es de ese canal o fecha fuera del mes. Devuelve también
 * cuántas se descartaron, para decirlo en pantalla.
 */
export function parseCalendarPlan(
  output: string,
  options: { channelIds: string[]; channels: PlanChannel[]; period: string; timezone: string },
): { proposals: CalendarProposal[]; discarded: number } {
  let raw: unknown;
  try {
    raw = JSON.parse(output);
  } catch {
    return { proposals: [], discarded: 0 };
  }
  const list = z.object({ pieces: z.array(z.unknown()) }).safeParse(raw);
  if (!list.success) return { proposals: [], discarded: 0 };

  const proposals: CalendarProposal[] = [];
  let discarded = 0;
  list.data.pieces.forEach((value, index) => {
    const piece = pieceSchema.safeParse(value);
    if (!piece.success) return void discarded++;
    const { channel: ref, format, date, title, idea } = piece.data;
    const refIndex = /^C(\d+)$/.exec(ref.trim());
    const channelId = refIndex ? options.channelIds[Number(refIndex[1]) - 1] : undefined;
    const channel = options.channels.find((c) => c.id === channelId);
    const plannedAt = date.trim().slice(0, 16);
    const valid =
      channel?.isActive &&
      isValidFormat(channel.kind, format) &&
      wallTimeToUtc(plannedAt, options.timezone) !== null &&
      periodOfWallTime(plannedAt) === options.period &&
      title.trim() !== "";
    if (!valid) return void discarded++;
    proposals.push({
      index,
      channelId: channel.id,
      channelName: channel.displayName,
      format,
      plannedAt,
      title: title.trim().slice(0, 200),
      idea: idea.trim().slice(0, 2000),
    });
  });
  proposals.sort((a, b) => a.plannedAt.localeCompare(b.plannedAt) || a.index - b.index);
  return { proposals, discarded };
}
