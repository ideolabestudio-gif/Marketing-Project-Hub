import { ActionForm } from "@/components/action-form";
import { formatInZone, utcToWallTime } from "@/lib/time";
import { hasPermission, type ProjectContext } from "@/modules/access/context";
import { WORKFLOW_LABELS } from "@/modules/review/domain";
import type { getItemReview } from "@/modules/review/service";
import {
  cancelPublicationAction,
  decideInternalAction,
  markPublishedAction,
  recordClientDecisionAction,
  recordPublicationAction,
  submitForReviewAction,
} from "./actions";

type Review = Awaited<ReturnType<typeof getItemReview>>;

const EVENT_LABELS: Record<string, string> = {
  "submission:submitted": "Enviada a revisión",
  "internal:approved": "Aprobada (revisión interna)",
  "internal:changes_requested": "Cambios pedidos (revisión interna)",
  "client:approved": "Aprobada por el cliente",
  "client:changes_requested": "Cambios pedidos por el cliente",
};

const NEXT_STEP: Record<string, string> = {
  idea: "Escribe el contenido para crear la primera versión.",
  draft: "Cuando el contenido esté listo, envíalo a revisión.",
  in_review: "Pendiente de la revisión interna.",
  awaiting_client: "Aprobada internamente. Envía la pieza al cliente y registra aquí su respuesta.",
  changes_requested: "Se han pedido cambios: guarda una versión nueva y vuelve a enviarla a revisión.",
  approved: "Aprobada. Publícala o prográmala en Metricool / MailerLite y registra aquí el resultado.",
  scheduled: "Programada. Cuando salga, confírmalo aquí.",
  published: "Publicada.",
  cancelled: "Pieza cancelada.",
};

function DateTimeInput({ name, defaultValue, tz }: { name: string; defaultValue?: string; tz: string }) {
  return (
    <label className="field">
      Fecha y hora ({tz})
      <input type="datetime-local" name={name} className="input" defaultValue={defaultValue} required />
    </label>
  );
}

export function ReviewSection({
  ctx,
  projectId,
  itemId,
  review,
  tz,
  plannedAt,
  cycleClosed,
}: {
  ctx: ProjectContext;
  projectId: string;
  itemId: string;
  review: Review;
  tz: string;
  plannedAt: Date | null;
  cycleClosed: boolean;
}) {
  const { status, latestVersion: latest, activePublication: active } = review;
  const open = !cycleClosed;
  const canSubmit = open && status === "draft" && latest && hasPermission(ctx, "content.write");
  const canDecideInternal = open && status === "in_review" && latest && hasPermission(ctx, "approval.internal");
  const blockedBySod = review.separationOfDuties && review.isAuthorOfLatest;
  const canRecordClient = open && status === "awaiting_client" && latest && hasPermission(ctx, "approval.client.record");
  const canPublish = open && status === "approved" && latest && hasPermission(ctx, "publish");
  const canManageScheduled = open && active?.status === "scheduled" && hasPermission(ctx, "publish");
  const nowWall = utcToWallTime(new Date(), tz);

  return (
    <section className="card flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="h2">Revisión y publicación</h2>
        <span className="badge">{WORKFLOW_LABELS[status]}</span>
        {latest && <span className="badge">Versión vigente: v{latest.versionNo}</span>}
        <span className="badge">
          {review.requireClientApproval ? "Requiere aprobación interna y del cliente" : "Requiere aprobación interna"}
        </span>
      </div>
      <p className="text-sm">{NEXT_STEP[status]}</p>

      {canSubmit && (
        <ActionForm
          action={submitForReviewAction.bind(null, projectId, itemId, latest.id)}
          submitLabel={`Enviar v${latest.versionNo} a revisión`}
        >
          <label className="field grow">
            Comentario para quien revise (opcional)
            <input name="comment" className="input" />
          </label>
        </ActionForm>
      )}

      {canDecideInternal &&
        (blockedBySod ? (
          <p className="text-sm text-muted">
            Has escrito tú esta versión: otra persona con permiso de revisión debe aprobarla (separación de funciones).
          </p>
        ) : (
          <ActionForm
            action={decideInternalAction.bind(null, projectId, itemId, latest.id)}
            submitLabel="Registrar decisión"
            className="grid gap-3"
          >
            <fieldset className="flex gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input type="radio" name="decision" value="approved" required /> Aprobar v{latest.versionNo}
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="decision" value="changes_requested" /> Pedir cambios
              </label>
            </fieldset>
            <label className="field">
              Comentario (obligatorio si pides cambios)
              <textarea name="comment" className="input min-h-16" />
            </label>
          </ActionForm>
        ))}

      {canRecordClient && (
        <ActionForm
          action={recordClientDecisionAction.bind(null, projectId, itemId, latest.id)}
          submitLabel="Registrar respuesta del cliente"
          className="grid gap-3"
        >
          <fieldset className="flex gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="radio" name="decision" value="approved" required /> El cliente aprueba v{latest.versionNo}
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="decision" value="changes_requested" /> El cliente pide cambios
            </label>
          </fieldset>
          <label className="field">
            Quién respondió en el cliente
            <input name="approverName" className="input" placeholder="Marta (Cerveza Byra)" required />
          </label>
          <label className="field">
            Evidencia
            <textarea
              name="evidence"
              className="input min-h-16"
              placeholder="Email de Marta del 3/11 a las 10:15: «OK, adelante»"
              required
            />
          </label>
          <label className="field">
            Comentario (opcional)
            <input name="comment" className="input" />
          </label>
        </ActionForm>
      )}

      {canPublish && (
        <div className="flex flex-col gap-2 rounded-md bg-background p-3">
          <p className="text-sm">
            El Hub no publica nada por sí mismo. Publica o programa la versión v{latest.versionNo} en la herramienta
            habitual (Metricool, MailerLite…) y registra aquí lo que has hecho.
          </p>
          <ActionForm
            action={recordPublicationAction.bind(null, projectId, itemId, latest.id)}
            submitLabel="Registrar"
            className="grid gap-3 md:grid-cols-2"
          >
            <label className="field">
              Qué has hecho
              <select name="status" className="input" defaultValue="scheduled">
                <option value="scheduled">La he programado</option>
                <option value="published">Ya está publicada</option>
              </select>
            </label>
            <DateTimeInput name="at" tz={tz} defaultValue={plannedAt ? utcToWallTime(plannedAt, tz) : nowWall} />
            <label className="field">
              Enlace (opcional)
              <input type="url" name="externalUrl" className="input" placeholder="https://www.instagram.com/p/…" />
            </label>
            <label className="field">
              ID en la herramienta (opcional)
              <input name="externalId" className="input" />
            </label>
            <label className="field md:col-span-2">
              Nota (opcional)
              <input name="note" className="input" />
            </label>
          </ActionForm>
        </div>
      )}

      {active && (
        <div className="flex flex-col gap-2 rounded-md bg-background p-3 text-sm">
          <p>
            <strong>{active.status === "published" ? "Publicada" : "Programada"}</strong>{" "}
            {active.status === "published" && active.publishedAt && formatInZone(active.publishedAt, tz)}
            {active.status === "scheduled" && active.scheduledAt && `para ${formatInZone(active.scheduledAt, tz)}`}
            {active.externalUrl && (
              <>
                {" · "}
                <a href={active.externalUrl} className="link break-all" target="_blank" rel="noopener noreferrer">
                  {active.externalUrl}
                </a>
              </>
            )}
          </p>
          {active.note && <p className="whitespace-pre-wrap text-muted">{active.note}</p>}
          {canManageScheduled && (
            <div className="grid gap-4 md:grid-cols-2">
              <ActionForm
                action={markPublishedAction.bind(null, projectId, active.id)}
                submitLabel="Confirmar publicación"
                className="grid content-start gap-2"
              >
                <DateTimeInput
                  name="at"
                  tz={tz}
                  defaultValue={active.scheduledAt ? utcToWallTime(active.scheduledAt, tz) : nowWall}
                />
                <label className="field">
                  Enlace (opcional)
                  <input type="url" name="externalUrl" className="input" defaultValue={active.externalUrl ?? ""} />
                </label>
              </ActionForm>
              <ActionForm
                action={cancelPublicationAction.bind(null, projectId, active.id)}
                submitLabel="Cancelar programación"
                variant="danger"
                className="grid content-start gap-2"
              >
                <label className="field">
                  Motivo
                  <input name="reason" className="input" placeholder="Hay que corregir el copy" required />
                </label>
              </ActionForm>
            </div>
          )}
        </div>
      )}

      {review.events.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-medium">Historial de revisión</h3>
          <table className="table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Versión</th>
                <th>Qué</th>
                <th>Quién</th>
                <th>Detalle</th>
              </tr>
            </thead>
            <tbody>
              {review.events.map((e) => (
                <tr key={e.id}>
                  <td className="whitespace-nowrap">{formatInZone(e.createdAt, tz)}</td>
                  <td>v{e.versionNo}</td>
                  <td>{EVENT_LABELS[`${e.stage}:${e.decision}`]}</td>
                  <td>
                    {e.actorName ?? e.actorEmail}
                    {e.clientApproverName && <span className="block text-muted">Cliente: {e.clientApproverName}</span>}
                  </td>
                  <td className="whitespace-pre-wrap">
                    {e.evidence && <span className="block">Evidencia: {e.evidence}</span>}
                    {e.comment}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {review.publications.some((p) => p.publication.status === "cancelled") && (
        <p className="text-xs text-muted">
          Programaciones canceladas:{" "}
          {review.publications
            .filter((p) => p.publication.status === "cancelled")
            .map((p) => `v${p.versionNo} (${p.publication.cancelledAt ? formatInZone(p.publication.cancelledAt, tz) : ""})`)
            .join(", ")}
        </p>
      )}
    </section>
  );
}
