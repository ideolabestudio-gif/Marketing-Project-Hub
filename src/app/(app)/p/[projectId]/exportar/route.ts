import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { requireProjectAccess } from "@/modules/access/context";
import { exportProject } from "@/modules/export/service";
import { getCurrentActor } from "@/modules/identity/next";

/** Descarga del proyecto entero en un ZIP: solo la responsable (permiso project.export). */
export async function GET(_: Request, { params }: RouteContext<"/p/[projectId]/exportar">) {
  const { projectId } = await params;
  const actor = await getCurrentActor();
  if (!actor) return new Response("No autenticado", { status: 401 });
  try {
    const ctx = await requireProjectAccess(actor, projectId, "project.export");
    const zip = await exportProject(ctx);
    return new Response(Buffer.from(zip.bytes), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Length": String(zip.bytes.byteLength),
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(zip.filename)}`,
        "X-Content-Type-Options": "nosniff",
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
