import { ActionForm } from "@/components/action-form";
import { AiGenerationMeta } from "@/components/ai-generation-meta";
import { CopyButton } from "@/components/copy-button";
import { hasPermission, type ProjectContext } from "@/modules/access/context";
import { getAiStatus, getCalendarPlanChatPrompt, listGenerations } from "@/modules/ai/service";
import { formatLabel } from "@/modules/content/formats";
import {
  applyCalendarPlanAction,
  generateCalendarPlanAction,
  importCalendarPlanAction,
  resolveGenerationAction,
} from "../../ai-actions";

/**
 * Propuesta de calendario con IA. La IA solo propone: las piezas se crean cuando una
 * persona marca las que quiere y pulsa «Añadir al calendario».
 */
export async function CalendarPlanSection({
  ctx,
  projectId,
  cycleId,
  period,
  writable,
  tz,
}: {
  ctx: ProjectContext;
  projectId: string;
  cycleId: string;
  period: string;
  writable: boolean;
  tz: string;
}) {
  const [status, generations] = await Promise.all([
    getAiStatus(ctx),
    listGenerations(ctx, { cycleId, purpose: "calendar_plan" }),
  ]);
  const canGenerate = status.enabled && status.configured && writable && hasPermission(ctx, "ai.generate");
  const canApply = writable && hasPermission(ctx, "content.write");
  // Sin API: el texto para el chat de Claude (null si no hay canales activos).
  const chatPrompt =
    writable && hasPermission(ctx, "ai.generate")
      ? await getCalendarPlanChatPrompt(ctx, { cycleId }).catch(() => null)
      : null;
  if (!canGenerate && !chatPrompt && generations.length === 0) return null;
  const drafts = generations.filter((g) => g.status === "draft");
  const past = generations.filter((g) => g.status !== "draft");

  return (
    <section id="calendario-ia" className="card flex flex-col gap-3" aria-label="Calendario con IA">
      <h2 className="h2">Calendario con IA</h2>
      <p className="text-sm text-muted">
        Claude propone piezas con fecha, canal y formato a partir del brief, lo ya planificado y el mes anterior. No se
        crea nada hasta que marques las que quieres y pulses «Añadir al calendario».
      </p>

      {canGenerate && (
        <ActionForm action={generateCalendarPlanAction.bind(null, projectId, cycleId)} submitLabel="Proponer calendario">
          <label className="field grow">
            Indicaciones (opcional)
            <input name="instructions" className="input" placeholder="3 posts por semana; campaña de Navidad el día 5" />
          </label>
        </ActionForm>
      )}
      {chatPrompt && (
        <details className="flex flex-col gap-3 rounded-md border border-border p-3" open={!canGenerate}>
          <summary className="cursor-pointer text-sm font-medium">Prepararlo con tu chat de Claude (sin API)</summary>
          <ol className="mt-3 flex list-decimal flex-col gap-3 pl-5 text-sm">
            <li className="flex flex-col gap-2">
              Copia este texto y pégalo en un chat nuevo de Claude. Puedes añadir al final lo que quieras («3 posts por
              semana», «campaña de Navidad el día 5»…).
              <textarea readOnly className="input font-mono text-xs" rows={6} value={chatPrompt} />
              <CopyButton text={chatPrompt} label="Copiar texto para Claude" />
            </li>
            <li className="flex flex-col gap-2">
              Pega aquí la respuesta completa del chat. Si cambias los canales del proyecto entre medias, vuelve a copiar el
              texto.
              <ActionForm
                action={importCalendarPlanAction.bind(null, projectId, cycleId)}
                submitLabel="Revisar propuesta"
                className="grid gap-3"
              >
                <textarea name="output" className="input font-mono text-xs" rows={6} required />
              </ActionForm>
            </li>
          </ol>
        </details>
      )}
      {drafts.map((g) => {
        const proposals = g.plan?.proposals ?? [];
        const discarded = g.plan?.discarded ?? 0;
        return (
          <div key={g.id} className="flex flex-col gap-3 rounded-md border border-violet-200 p-3">
            <AiGenerationMeta generation={g} tz={tz} />
            {discarded > 0 && (
              <p className="text-sm text-muted">
                {discarded === 1
                  ? "Se ha descartado 1 propuesta con un canal, formato o fecha que no encaja en este mes."
                  : `Se han descartado ${discarded} propuestas con un canal, formato o fecha que no encajan en este mes.`}
              </p>
            )}
            {proposals.length === 0 ? (
              <p className="text-sm text-muted">La respuesta no contiene piezas que se puedan usar.</p>
            ) : canApply ? (
              <ActionForm
                action={applyCalendarPlanAction.bind(null, projectId, g.id)}
                submitLabel="Añadir al calendario"
                className="grid gap-3"
              >
                <ul className="flex flex-col divide-y divide-border">
                  {proposals.map((p) => (
                    <li key={p.index} className="flex flex-col gap-2 py-3">
                      <label className="flex items-center gap-2 text-sm font-medium">
                        <input type="checkbox" name="pick" value={p.index} defaultChecked />
                        {p.channelName} · {formatLabel(p.format)}
                      </label>
                      <div className="flex flex-wrap gap-3">
                        <label className="field grow">
                          Título
                          <input name={`title-${p.index}`} className="input" defaultValue={p.title} maxLength={200} />
                        </label>
                        <label className="field">
                          Fecha ({tz})
                          <input
                            type="datetime-local"
                            name={`plannedAt-${p.index}`}
                            className="input"
                            defaultValue={p.plannedAt}
                            min={`${period}-01T00:00`}
                            max={`${period}-31T23:59`}
                          />
                        </label>
                      </div>
                      <label className="field">
                        Idea (se guarda como comentario de la pieza)
                        <textarea name={`idea-${p.index}`} className="input" rows={2} defaultValue={p.idea} />
                      </label>
                    </li>
                  ))}
                </ul>
              </ActionForm>
            ) : (
              <ul className="flex flex-col gap-1 text-sm">
                {proposals.map((p) => (
                  <li key={p.index}>
                    {p.plannedAt.replace("T", " ")} · {p.channelName} · {formatLabel(p.format)} · {p.title}
                  </li>
                ))}
              </ul>
            )}
            {hasPermission(ctx, "ai.generate") && (
              <ActionForm
                action={resolveGenerationAction.bind(null, projectId, g.id, "discarded")}
                submitLabel="Descartar propuesta"
                variant="secondary"
              >
                {null}
              </ActionForm>
            )}
          </div>
        );
      })}
      {past.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer">Propuestas anteriores ({past.length})</summary>
          <ul className="mt-2 flex flex-col gap-3">
            {past.map((g) => (
              <li key={g.id} className="flex flex-col gap-1">
                <AiGenerationMeta generation={g} tz={tz} />
                {g.status === "failed" ? (
                  <p className="text-red-700">{g.error}</p>
                ) : (
                  <ul className="text-muted">
                    {(g.plan?.proposals ?? []).map((p) => (
                      <li key={p.index}>
                        {p.plannedAt.replace("T", " ")} · {p.channelName} · {formatLabel(p.format)} · {p.title}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
