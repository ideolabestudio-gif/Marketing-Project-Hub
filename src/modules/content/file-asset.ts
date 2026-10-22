import { createHash, randomUUID } from "node:crypto";
import { ValidationError } from "@/lib/errors";
import { assetStorageKey } from "@/lib/storage";
import { ALLOWED_DESCRIPTION, detectMimeType, MAX_UPLOAD_BYTES } from "./files";
import type { NewAsset } from "./repo";

function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "archivo";
  const clean = base.replace(/[^\p{L}\p{N}._ -]/gu, "_").trim().slice(0, 150);
  return clean || "archivo";
}

/**
 * Valida el archivo (tamaño y tipo real por sus primeros bytes) y lo prepara para
 * guardarse en la base de datos junto con su fila, en la misma transacción.
 */
export function prepareFileAsset(projectId: string, input: { filename: string; bytes: Uint8Array }): NewAsset {
  if (input.bytes.byteLength === 0) throw new ValidationError("El archivo está vacío");
  if (input.bytes.byteLength > MAX_UPLOAD_BYTES) throw new ValidationError(`Archivo demasiado grande (${ALLOWED_DESCRIPTION})`);
  const mimeType = detectMimeType(input.bytes);
  if (!mimeType) throw new ValidationError(`Tipo de archivo no admitido (${ALLOWED_DESCRIPTION})`);
  const assetId = randomUUID();
  return {
    id: assetId,
    kind: "file",
    storageKey: assetStorageKey(projectId, assetId),
    url: null,
    filename: sanitizeFilename(input.filename),
    mimeType,
    sizeBytes: input.bytes.byteLength,
    sha256: createHash("sha256").update(input.bytes).digest("hex"),
    bytes: input.bytes,
  };
}
