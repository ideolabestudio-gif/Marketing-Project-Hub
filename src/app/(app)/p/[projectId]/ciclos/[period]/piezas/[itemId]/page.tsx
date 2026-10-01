import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { AssetList } from "@/components/asset-list";
import { ChannelFormatSelect } from "@/components/channel-format-select";
import { orNotFound, projectContextForPage } from "@/lib/project-page";
import { formatInZone, utcToWallTime } from "@/lib/time";
import { hasPermission } from "@/modules/access/context";
import { ALLOWED_DESCRIPTION } from "@/modules/content/files";
import { formatLabel, ITEM_STATUS_LABELS } from "@/modules/content/formats";
import { getItemDetail } from "@/modules/content/service";
import { getProject, listChannels } from "@/modules/projects/service";
import {
  addCommentAction,
  addLinkAction,
  removeAssetAction,
  saveVersionAction,
  setCancelledAction,
  updateItemAction,
  uploadAssetAction,
} from "./actions";

export default async function ItemPage({ params }: PageProps<"/p/[projectId]/ciclos/[period]/piezas/[itemId]">) {
  const { projectId, period, itemId } = await params;
  const ctx = await projectContextForPage(projectId);
  const { item, current, currentAssets, versions, comments } = await orNotFound(getItemDetail(ctx, itemId));
  if (item.cyclePeriod !== period) notFound();
  const [project, channels] = await Promise.all([getProject(ctx), listChannels(ctx)]);

  const tz = project.timezone;
  const cycleUrl = `/p/${projectId}/ciclos/${period}`;
  const cancelled = item.status === "cancelled";
  const editable = hasPermission(ctx, "content.write") && item.cycleStatus !== "closed";
  const canEditContent = editable && !cancelled;
  const canComment = hasPermission(ctx, "comment.write") && item.cycleStatus !== "closed";
  const isEmail = item.channelKind === "email";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={cycleUrl} className="link text-sm">
          ← Plan del mes
        </Link>
        <h1 className={`h1 mt-1 ${cancelled ? "line-through opacity-60" : ""}`}>{item.title}</h1>
        <div className="mt-2 flex flex-wrap gap-2">
          <span className="badge">{ITEM_STATUS_LABELS[item.status]}</span>
          <span className="badge">
            {item.channelName} · {formatLabel(item.format)}
          </span>
          <span className="badge">{item.plannedAt ? formatInZone(item.plannedAt, tz) : "Sin fecha"}</span>
          <span className="badge">{current ? `Versión ${current.versionNo}` : "Sin versiones"}</span>
        </div>
      </div>

      <section className="card flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="h2">Contenido {current && <span className="text-muted">· v{current.versionNo}</span>}</h2>
          {versions.length > 0 && (
            <Link href={`${cycleUrl}/piezas/${item.id}/versiones`} className="link text-sm">
              Historial ({versions.length})
            </Link>
          )}
        </div>
        {canEditContent ? (
          <ActionForm
            action={saveVersionAction.bind(null, projectId, item.id)}
            submitLabel="Guardar como nueva versión"
            className="grid gap-3"
          >
            {isEmail && (
              <>
                <label className="field">
                  Asunto
                  <input name="emailSubject" className="input" defaultValue={current?.emailSubject ?? ""} />
                </label>
                <label className="field">
                  Preencabezado
                  <input name="emailPreheader" className="input" defaultValue={current?.emailPreheader ?? ""} />
                </label>
              </>
            )}
            <label className="field">
              {isEmail ? "Cuerpo del email" : "Copy"}
              <textarea name="body" className="input min-h-48 font-mono text-sm" defaultValue={current?.body ?? ""} />
            </label>
            <label className="field">
              Enlace de destino (opcional)
              <input name="linkUrl" type="url" className="input" defaultValue={current?.linkUrl ?? ""} />
            </label>
            <label className="field">
              Nota del cambio (opcional)
              <input name="note" className="input" placeholder="Ajustado el CTA" />
            </label>
          </ActionForm>
        ) : current ? (
          <div className="flex flex-col gap-2 text-sm">
            {isEmail && (
              <p>
                <span className="text-muted">Asunto:</span> {current.emailSubject || "—"}
                <br />
                <span className="text-muted">Preencabezado:</span> {current.emailPreheader || "—"}
              </p>
            )}
            <pre className="whitespace-pre-wrap rounded-md bg-background p-3 font-sans">{current.body || "—"}</pre>
            {current.linkUrl && <p className="break-all text-muted">Enlace: {current.linkUrl}</p>}
          </div>
        ) : (
          <p className="text-sm text-muted">Sin contenido todavía.</p>
        )}
      </section>

      <section className="card flex flex-col gap-3">
        <h2 className="h2">Archivos y enlaces</h2>
        <AssetList
          projectId={projectId}
          assets={currentAssets}
          action={
            canEditContent
              ? (a) => (
                  <ActionForm
                    action={removeAssetAction.bind(null, projectId, item.id, a.id)}
                    submitLabel="Quitar"
                    variant="danger"
                  >
                    {null}
                  </ActionForm>
                )
              : undefined
          }
        />
        {canEditContent && (
          <div className="grid gap-4 md:grid-cols-2">
            <ActionForm action={uploadAssetAction.bind(null, projectId, item.id)} submitLabel="Subir">
              <label className="field">
                Archivo ({ALLOWED_DESCRIPTION})
                <input
                  type="file"
                  name="file"
                  className="input"
                  accept="image/png,image/jpeg,image/gif,image/webp,application/pdf,video/mp4,video/quicktime"
                  required
                />
              </label>
            </ActionForm>
            <ActionForm action={addLinkAction.bind(null, projectId, item.id)} submitLabel="Añadir enlace">
              <label className="field">
                Enlace (Drive, Canva…)
                <input type="url" name="url" className="input" required />
              </label>
              <label className="field">
                Nombre
                <input name="label" className="input" />
              </label>
            </ActionForm>
          </div>
        )}
        <p className="text-xs text-muted">
          Cada cambio de archivos crea una versión nueva; las versiones anteriores conservan sus archivos.
        </p>
      </section>

      <section className="card flex flex-col gap-3">
        <h2 className="h2">Comentarios</h2>
        {comments.length === 0 ? (
          <p className="text-sm text-muted">Sin comentarios.</p>
        ) : (
          <ul className="flex flex-col gap-3 text-sm">
            {comments.map((c) => (
              <li key={c.id} className="rounded-md bg-background p-3">
                <div className="text-xs text-muted">
                  {c.authorName ?? c.authorEmail} · {formatInZone(c.createdAt, tz)}
                  {c.versionNo && ` · sobre v${c.versionNo}`}
                </div>
                <p className="mt-1 whitespace-pre-wrap">{c.body}</p>
              </li>
            ))}
          </ul>
        )}
        {canComment && (
          <ActionForm action={addCommentAction.bind(null, projectId, item.id)} submitLabel="Comentar" className="grid gap-2">
            <textarea name="body" className="input min-h-20" required />
          </ActionForm>
        )}
      </section>

      {editable && (
        <section className="card flex flex-col gap-3">
          <h2 className="h2">Datos de la pieza</h2>
          {!cancelled && (
            <ActionForm action={updateItemAction.bind(null, projectId, item.id)} submitLabel="Guardar datos">
              <label className="field">
                Título interno
                <input name="title" className="input" defaultValue={item.title} required />
              </label>
              <label className="field">
                Canal y formato
                <ChannelFormatSelect channels={channels} defaultValue={`${item.channelId}|${item.format}`} />
              </label>
              <label className="field">
                Fecha prevista ({tz})
                <input
                  type="datetime-local"
                  name="plannedAt"
                  className="input"
                  defaultValue={item.plannedAt ? utcToWallTime(item.plannedAt, tz) : ""}
                />
              </label>
            </ActionForm>
          )}
          <ActionForm
            action={setCancelledAction.bind(null, projectId, item.id, !cancelled)}
            submitLabel={cancelled ? "Reactivar pieza" : "Cancelar pieza"}
            variant={cancelled ? "secondary" : "danger"}
          >
            {null}
          </ActionForm>
        </section>
      )}
    </div>
  );
}
