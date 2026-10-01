import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { requireProjectAccess } from "@/modules/access/context";
import { getAssetFile } from "@/modules/content/service";
import { INLINE_MIME_TYPES } from "@/modules/content/files";
import { getCurrentActor } from "@/modules/identity/next";

/**
 * Descarga de archivos: solo miembros del proyecto. No hay URLs públicas ni firmadas;
 * cada descarga se autoriza (prueba FS-01).
 */
export async function GET(_: Request, { params }: RouteContext<"/p/[projectId]/archivos/[assetId]">) {
  const { projectId, assetId } = await params;
  const actor = await getCurrentActor();
  if (!actor) return new Response("No autenticado", { status: 401 });
  try {
    const ctx = await requireProjectAccess(actor, projectId);
    const file = await getAssetFile(ctx, assetId);
    const disposition = INLINE_MIME_TYPES.has(file.mimeType) ? "inline" : "attachment";
    return new Response(Buffer.from(file.bytes), {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Length": String(file.bytes.byteLength),
        "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    if (err instanceof NotFoundError || err instanceof ForbiddenError) {
      return new Response("No encontrado", { status: 404 });
    }
    throw err;
  }
}
