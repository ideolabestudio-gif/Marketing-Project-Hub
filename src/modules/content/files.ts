/**
 * Tipos de archivo admitidos. El tipo se detecta por los primeros bytes, no por la
 * extensión ni por lo que diga el navegador. No se admiten SVG ni HTML (podrían
 * ejecutar código al abrirlos).
 */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

const startsWith = (b: Uint8Array, sig: number[], offset = 0) => sig.every((v, i) => b[offset + i] === v);
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

export function detectMimeType(bytes: Uint8Array): string | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, ascii("GIF87a")) || startsWith(bytes, ascii("GIF89a"))) return "image/gif";
  if (startsWith(bytes, ascii("RIFF")) && startsWith(bytes, ascii("WEBP"), 8)) return "image/webp";
  if (startsWith(bytes, ascii("%PDF-"))) return "application/pdf";
  if (startsWith(bytes, ascii("ftyp"), 4)) {
    return startsWith(bytes, ascii("qt  "), 8) ? "video/quicktime" : "video/mp4";
  }
  return null;
}

/** Se muestran en el navegador; el resto se descarga como adjunto. */
export const INLINE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

export const ALLOWED_DESCRIPTION = "PNG, JPG, GIF, WebP, PDF, MP4 o MOV de hasta 25 MB";
