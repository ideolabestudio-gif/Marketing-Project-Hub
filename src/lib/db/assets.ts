import type { getDb } from "./client";
import { assetFiles, assets } from "./schema";

export type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

type AssetRow = typeof assets.$inferSelect;

/** Activo listo para insertar (lo prepara content/file-asset.ts o un enlace). */
export type NewAsset = Pick<AssetRow, "id" | "kind" | "storageKey" | "url" | "filename" | "mimeType" | "sizeBytes" | "sha256"> & {
  /** Contenido del archivo (solo kind = file); se guarda en la misma transacción que el activo. */
  bytes?: Uint8Array;
};

/**
 * Inserta un activo (y su contenido) dentro de la transacción de quien lo usa: una versión
 * de pieza, la biblioteca o la evidencia de una respuesta del cliente.
 */
export async function insertAsset(
  tx: Tx,
  owner: { projectId: string; userId: string },
  { bytes, ...asset }: NewAsset,
): Promise<void> {
  await tx.insert(assets).values({ ...asset, projectId: owner.projectId, uploadedBy: owner.userId });
  if (bytes) await tx.insert(assetFiles).values({ projectId: owner.projectId, assetId: asset.id, bytes });
}
