/** Formatos de pieza según el tipo de canal. */
export const FORMATS = {
  social: {
    post: "Post",
    carousel: "Carrusel",
    reel: "Reel / vídeo corto",
    story: "Story",
    video: "Vídeo",
    other: "Otro",
  },
  email: {
    newsletter: "Newsletter",
    campaign: "Campaña",
    other: "Otro",
  },
  // La tienda online no tiene piezas: solo aporta métricas al informe.
  shop: {},
} as const;

export type ChannelKind = keyof typeof FORMATS;

export const CHANNEL_KIND_LABELS: Record<ChannelKind, string> = {
  social: "Redes",
  email: "Email",
  shop: "Tienda online",
};

/** ¿Se planifican piezas en este tipo de canal? (La tienda online solo tiene métricas.) */
export function hasPieces(kind: ChannelKind): boolean {
  return Object.keys(FORMATS[kind]).length > 0;
}

export function isValidFormat(kind: ChannelKind, format: string): boolean {
  return Object.hasOwn(FORMATS[kind], format);
}

export function formatLabel(format: string): string {
  for (const group of Object.values(FORMATS)) {
    if (Object.hasOwn(group, format)) return group[format as keyof typeof group];
  }
  return format;
}

export const ITEM_STATUS_LABELS: Record<string, string> = {
  idea: "Idea",
  draft: "Borrador",
  in_review: "En revisión",
  changes_requested: "Cambios pedidos",
  approved: "Aprobada",
  scheduled: "Programada",
  published: "Publicada",
  cancelled: "Cancelada",
};
