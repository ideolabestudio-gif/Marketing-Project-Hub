import Link from "next/link";
import { Breadcrumbs, cycleCrumbs } from "@/components/breadcrumbs";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { AssetList } from "@/components/asset-list";
import { ChannelFormatSelect } from "@/components/channel-format-select";
import { FileInput } from "@/components/file-input";
import { CollapsibleCard } from "@/components/collapsible-card";
import { ClaudeHandoff } from "@/components/claude-handoff";
import { StatusPill } from "@/components/status-pill";
import { orNotFound, projectContextForPage } from "@/lib/project-page";
import { formatInZone, formatPeriod, utcToWallTime } from "@/lib/time";
import { hasPermission } from "@/modules/access/context";
import { ALLOWED_DESCRIPTION } from "@/modules/content/files";
import { formatLabel } from "@/modules/content/formats";
import { buildMailerLiteHandoff } from "@/modules/content/mailerlite-handoff";
import { buildMetricoolHandoff } from "@/modules/content/metricool-handoff";
import { getItemDetail, LIBRARY_CATEGORIES, listItems, listLibrary } from "@/modules/content/service";
import { listCycles } from "@/modules/cycles/service";
import { getItemMetrics } from "@/modules/metrics/service";
import { getProject, listChannels } from "@/modules/projects/service";
import { getItemReview, isLocked } from "@/modules/review/service";
import {
  addCommentAction,
  addLinkAction,
  duplicateItemAction,
  attachLibraryItemAction,
  removeAssetAction,
  saveVersionAction,
  setCancelledAction,
  updateItemAction,
  uploadAssetAction,
} from "./actions";
import { AiSection } from "./ai-section";
import { ItemMetricsSection } from "./item-metrics-section";
import { NEXT_STEP, ReviewSection, SOLO_DRAFT_STEP } from "./review-section";

import type { Metadata } from "next";
import { itemTitle } from "@/lib/page-title";

export async function generateMetadata({ params }: PageProps<"/p/[projectId]/ciclos/[period]/piezas/[itemId]">): Promise<Metadata> {
  const { projectId, period, itemId } = await params;
  return itemTitle(projectId, period, itemId);
}

export default async function ItemPage({ params }: PageProps<"/p/[projectId]/ciclos/[period]/piezas/[itemId]">) {
  const { projectId, period, itemId } = await params;
  const ctx = await projectContextForPage(projectId);
  const { item, current, currentAssets, versions, comments } = await orNotFound(getItemDetail(ctx, itemId));
  if (item.cyclePeriod !== period) notFound();
  const [project, channels, review, library, siblings, cycles, itemMetrics] = await Promise.all([
    getProject(ctx),
    listChannels(ctx),
    getItemReview(ctx, item.id),
    listLibrary(ctx),
    listItems(ctx, item.cycleId),
    listCycles(ctx),
    getItemMetrics(ctx, item.id),
  ]);

  const tz = project.timezone;
  const cycleUrl = `/p/${projectId}/ciclos/${period}`;
  const cancelled = item.status === "cancelled";
  const locked = isLocked(review.status);
  const editable = hasPermission(ctx, "content.write") && item.cycleStatus !== "closed" && !locked;
  const canEditContent = editable && !cancelled;
  const editVoidsApproval = ["in_review", "awaiting_client", "approved"].includes(review.status);
  const canComment = hasPermission(ctx, "comment.write") && item.cycleStatus !== "closed";
  const isEmail = item.channelKind === "email";
  const at = siblings.findIndex((s) => s.id === item.id);
  const prev = siblings[at - 1];
  const next = siblings[at + 1];
  const openCycles = cycles.filter((c) => c.status !== "closed");
  const canDuplicate = hasPermission(ctx, "content.write") && !ctx.projectArchived && openCycles.length > 0;
  const channel = channels.find((c) => c.id === item.channelId);
  const mailerLiteText =
    review.status === "approved" && isEmail && current
      ? buildMailerLiteHandoff({
          brand: project.clientName,
          channelName: item.channelName,
          handle: channel?.handle ?? null,
          title: item.title,
          plannedAt: item.plannedAt,
          timeZone: tz,
          versionNo: current.versionNo,
          subject: current.emailSubject,
          preheader: current.emailPreheader,
          body: current.body,
          linkUrl: current.linkUrl,
        })
      : null;
  // «Qué toca ahora»: el paso siguiente y dónde se da.
  const nowStep =
    cancelled || review.status === "published"
      ? null
      : {
          text: review.soloMode && review.status === "draft" ? SOLO_DRAFT_STEP : NEXT_STEP[review.status],
          href: ["idea", "changes_requested"].includes(review.status)
            ? "#contenido-pieza"
            : review.status === "approved"
              ? "#programar"
              : "#revision",
          label: ["idea", "changes_requested"].includes(review.status)
            ? "Ir al contenido"
            : review.status === "approved"
              ? "Ir a programar"
              : "Ir a revisión y publicación",
        };
  const metricoolText =
    review.status === "approved" && !isEmail && current
      ? buildMetricoolHandoff({
          brand: project.clientName,
          channelName: item.channelName,
          format: item.format,
          plannedAt: item.plannedAt,
          timeZone: tz,
          versionNo: current.versionNo,
          body: current.body,
          linkUrl: current.linkUrl,
          assets: currentAssets,
        })
      : null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Breadcrumbs help="piezas" items={cycleCrumbs(projectId, project.name, period, formatPeriod(period, project.locale))} />
          {project.designUrl && !isEmail && (
            <a href={project.designUrl} className="btn btn-primary" target="_blank" rel="noopener noreferrer">
              Crear diseño <span aria-hidden="true">↗</span>
            </a>
          )}
        </div>
        <h1 className={`h1 mt-1 ${cancelled ? "line-through opacity-60" : ""}`}>{item.title}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <StatusPill status={review.status} />
          <span className="badge">
            {item.channelName} · {formatLabel(item.format)}
          </span>
          <span className="badge">{item.plannedAt ? formatInZone(item.plannedAt, tz) : "Sin fecha"}</span>
          <span className="badge">{current ? `Versión ${current.versionNo}` : "Sin versiones"}</span>
          {item.aiGenerationId && <span className="badge-ai">Propuesta por IA en el calendario</span>}
        </div>
        {(prev || next) && (
          <nav aria-label="Otras piezas del mes" className="mt-3 flex flex-wrap justify-between gap-2 text-sm">
            {prev ? (
              <Link href={`${cycleUrl}/piezas/${prev.id}`} className="link min-w-0 truncate text-muted">
                <span aria-hidden="true">‹</span> Anterior: {prev.title}
              </Link>
            ) : (
              <span />
            )}
            {next && (
              <Link href={`${cycleUrl}/piezas/${next.id}`} className="link min-w-0 truncate text-muted">
                Siguiente: {next.title} <span aria-hidden="true">›</span>
              </Link>
            )}
          </nav>
        )}
      </div>

      {nowStep && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/30 bg-accent-soft px-4 py-3 text-sm text-accent-ink">
          <p>
            <strong>Qué toca ahora:</strong> {nowStep.text}
            {!["approved", "scheduled"].includes(review.status) && (
              <span className="block opacity-80">
                Cuando esté aprobada, aquí mismo tendrás el texto para llevarla a {isEmail ? "MailerLite" : "Metricool"}{" "}
                con Claude.
              </span>
            )}
          </p>
          <a href={nowStep.href} className="btn btn-secondary">
            {nowStep.label}
          </a>
        </div>
      )}

      <ReviewSection
        ctx={ctx}
        projectId={projectId}
        itemId={item.id}
        review={review}
        tz={tz}
        plannedAt={item.plannedAt}
        cycleClosed={item.cycleStatus === "closed"}
      />

      {(["scheduled", "published"].includes(review.status) || itemMetrics.values.length > 0) && (
        <ItemMetricsSection
          projectId={projectId}
          itemId={item.id}
          data={itemMetrics}
          tz={tz}
          canWrite={hasPermission(ctx, "metrics.write") && item.cycleStatus !== "closed"}
          published={review.status === "published"}
        />
      )}

      {metricoolText && (
        <ClaudeHandoff
          id="programar"
          title="Programar en Metricool"
          intro="Claude deja la publicación en Metricool como pendiente de revisión; nunca la publica."
          connector="Metricool"
          after="Revísala en Metricool, añade las imágenes o vídeos, prográmala allí y registra aquí la programación."
          text={metricoolText}
          copyLabel="Copiar para Metricool"
        />
      )}
      {mailerLiteText && (
        <ClaudeHandoff
          id="programar"
          title="Preparar en MailerLite"
          intro="Claude deja la campaña como borrador en MailerLite; nunca la programa ni la envía."
          connector="MailerLite"
          after="Revisa el borrador en MailerLite, elige los destinatarios, prográmalo o envíalo allí y registra aquí lo que hayas hecho."
          text={mailerLiteText}
          copyLabel="Copiar para MailerLite"
        />
      )}

      <section id="contenido-pieza" className="card flex scroll-mt-20 flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="h2">Contenido {current && <span className="text-muted">· v{current.versionNo}</span>}</h2>
          {versions.length > 0 && (
            <Link href={`${cycleUrl}/piezas/${item.id}/versiones`} className="link text-sm">
              Historial ({versions.length})
            </Link>
          )}
        </div>
        {canEditContent && editVoidsApproval && (
          <p className="notice">
            Esta versión ya está en revisión o aprobada. Si guardas cambios se creará una versión nueva y habrá que
            volver a revisarla y aprobarla.
          </p>
        )}
        {locked && (
          <p className="text-sm text-muted">
            La pieza está {review.status === "published" ? "publicada" : "programada"}: el contenido no se puede
            modificar{review.status === "scheduled" ? " (cancela la programación si necesitas corregir algo)" : ""}.
          </p>
        )}
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
              <textarea name="body" className="input min-h-48 leading-relaxed" defaultValue={current?.body ?? ""} />
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
            <pre className="tile font-sans leading-relaxed whitespace-pre-wrap">{current.body || "—"}</pre>
            {current.linkUrl && <p className="break-all text-muted">Enlace: {current.linkUrl}</p>}
          </div>
        ) : (
          <p className="text-sm text-muted">Sin contenido todavía.</p>
        )}
      </section>

      <AiSection
        ctx={ctx}
        projectId={projectId}
        cycleId={item.cycleId}
        itemId={item.id}
        isEmail={isEmail}
        canEditContent={canEditContent}
        tz={tz}
      />

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
                    confirm="¿Quitarlo de la pieza? Se guarda una versión nueva sin él."
                    variant="danger"
                  >
                    {null}
                  </ActionForm>
                )
              : undefined
          }
        />
        {canEditContent && (
          <details open={currentAssets.length === 0}>
            <summary className="text-sm font-medium">Añadir archivo o enlace</summary>
            <div className="mt-3 flex flex-col gap-3">
              {canEditContent && (
                <div className="grid gap-3 md:grid-cols-2">
                  <ActionForm
                    action={uploadAssetAction.bind(null, projectId, item.id)}
                    submitLabel="Subir"
                    className="tile flex min-w-0 flex-col items-start gap-3"
                  >
                    <h3 className="eyebrow">Subir archivo</h3>
                    <label className="field w-full">
                      Archivo ({ALLOWED_DESCRIPTION})
                      <FileInput
                        name="file"
                        accept="image/png,image/jpeg,image/gif,image/webp,application/pdf,video/mp4,video/quicktime"
                        required
                      />
                    </label>
                  </ActionForm>
                  <ActionForm
                    action={addLinkAction.bind(null, projectId, item.id)}
                    submitLabel="Añadir enlace"
                    className="tile flex min-w-0 flex-col items-start gap-3"
                  >
                    <h3 className="eyebrow">Añadir enlace</h3>
                    <label className="field w-full">
                      Enlace (Drive, Canva…)
                      <input type="url" name="url" className="input" required />
                    </label>
                    <label className="field w-full">
                      Nombre
                      <input name="label" className="input" />
                    </label>
                  </ActionForm>
                </div>
              )}
              {canEditContent &&
                (library.length === 0 ? (
                  <p className="text-sm text-muted">
                    Para reutilizar logos, fotos o plantillas, súbelos a la{" "}
                    <Link href={`/p/${projectId}/ficha`} className="link">
                      ficha del cliente
                    </Link>
                    .
                  </p>
                ) : (
                  <ActionForm
                    action={attachLibraryItemAction.bind(null, projectId, item.id)}
                    submitLabel="Añadir a la pieza"
                    className="tile flex flex-wrap items-end gap-3"
                  >
                    <label className="field min-w-0 grow basis-64">
                      Desde la biblioteca del cliente
                      <select name="libraryItemId" className="input" required>
                        {library.map((m) => (
                          <option key={m.id} value={m.id} disabled={currentAssets.some((a) => a.id === m.asset.id)}>
                            {LIBRARY_CATEGORIES[m.category]} · {m.title}
                          </option>
                        ))}
                      </select>
                    </label>
                  </ActionForm>
                ))}
            </div>
          </details>
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
              <li key={c.id} className="tile">
                <div className="text-xs text-muted">
                  <span className="font-medium text-foreground">{c.authorName ?? c.authorEmail}</span> ·{" "}
                  {formatInZone(c.createdAt, tz)}
                  {c.versionNo && ` · sobre v${c.versionNo}`}
                </div>
                <p className="mt-1 whitespace-pre-wrap">{c.body}</p>
              </li>
            ))}
          </ul>
        )}
        {canComment && (
          <ActionForm
            action={addCommentAction.bind(null, projectId, item.id)}
            submitLabel="Comentar"
            className="grid gap-2"
          >
            <textarea name="body" className="input min-h-20" required />
          </ActionForm>
        )}
      </section>

      {editable && (
        <CollapsibleCard
          title="Datos de la pieza"
          hint={`${item.channelName} · ${formatLabel(item.format)} · ${item.plannedAt ? formatInZone(item.plannedAt, tz) : "sin fecha"}`}
          defaultOpen={cancelled || !item.plannedAt}
        >
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
        </CollapsibleCard>
      )}

      {canDuplicate && (
        <CollapsibleCard title="Duplicar pieza" hint="Una copia con el mismo canal, formato, texto y archivos, en borrador.">
          <p className="text-sm text-muted">
            La copia nace sin aprobaciones: hay que revisarla como cualquier otra. En otro mes queda sin fecha.
          </p>
          <ActionForm action={duplicateItemAction.bind(null, projectId, item.id)} submitLabel="Duplicar">
            <label className="field">
              Mes de la copia
              <select name="cycle" className="input" defaultValue={`${item.cycleId}|${period}`}>
                {openCycles.map((c) => (
                  <option key={c.id} value={`${c.id}|${c.period}`}>
                    {formatPeriod(c.period, project.locale)}
                  </option>
                ))}
              </select>
            </label>
          </ActionForm>
        </CollapsibleCard>
      )}
    </div>
  );
}
