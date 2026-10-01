/**
 * Catálogo de plataformas. Solo describe el canal; no implica ninguna integración.
 * Todos los canales empiezan en modo manual (ver docs/07-integraciones.md).
 */
export const PLATFORMS = {
  instagram: { label: "Instagram", kind: "social" },
  facebook: { label: "Facebook", kind: "social" },
  linkedin: { label: "LinkedIn", kind: "social" },
  tiktok: { label: "TikTok", kind: "social" },
  x: { label: "X", kind: "social" },
  youtube: { label: "YouTube", kind: "social" },
  pinterest: { label: "Pinterest", kind: "social" },
  threads: { label: "Threads", kind: "social" },
  newsletter: { label: "Newsletter (email)", kind: "email" },
} as const;

export type Platform = keyof typeof PLATFORMS;
export const PLATFORM_KEYS = Object.keys(PLATFORMS) as [Platform, ...Platform[]];
