import { ActionForm } from "@/components/action-form";
import { AiGenerationMeta } from "@/components/ai-generation-meta";
import { hasPermission, type ProjectContext } from "@/modules/access/context";
import { splitEmailDraft } from "@/modules/ai/format";
import { getAiStatus, listGenerations } from "@/modules/ai/service";
import { applyCopyDraftAction, generateCopyDraftAction, resolveGenerationAction } from "../../../../ai-actions";

/** Borradores de texto con IA para la pieza. Usar uno crea una versión marcada. */
export async function AiSection({
  ctx,
  projectId,
  cycleId,
  itemId,
  isEmail,
  canEditContent,
  tz,
}: {
  ctx: ProjectContext;
  projectId: string;
  cycleId: string;
  itemId: string;
  isEmail: boolean;
  canEditContent: boolean;
  tz: string;
}) {
  const [status, generations] = await Promise.all([
    getAiStatus(ctx),
    listGenerations(ctx, { cycleId, contentItemId: itemId }),
  ]);
  const canGenerate = status.enabled && status.configured && canEditContent && hasPermission(ctx, "ai.generate");
  if (!status.enabled && generations.length === 0) return null;
  const drafts = generations.filter((g) => g.status === "draft");
  const past = generations.filter((g) => g.status !== "draft");

  return (
    <section className="card flex flex-col gap-3" aria-label="Borradores con IA">
      <h2 className="h2">Borradores con IA</h2>
      <p className="text-sm text-muted">
        La IA propone un texto a partir del brief del mes y de esta pieza. No cambia nada: si te sirve, edítalo y
        guárdalo como versión nueva (quedará marcada como asistida por IA y tendrá que pasar la revisión).
      </p>
      {status.enabled && !status.configured && (
        <p className="text-sm text-muted">La IA no está configurada en el servidor.</p>
      )}
      {canGenerate && (
        <ActionForm action={generateCopyDraftAction.bind(null, projectId, itemId)} submitLabel="Generar borrador">
          <label className="field grow">
            Indicaciones (opcional)
            <input name="instructions" className="input" placeholder="Tono cercano, menciona el evento del día 15" />
          </label>
        </ActionForm>
      )}

      {drafts.map((g) => {
        const email = isEmail ? splitEmailDraft(g.output) : null;
        return (
          <div key={g.id} className="flex flex-col gap-2 rounded-md border border-violet-200 p-3">
            <AiGenerationMeta generation={g} tz={tz} />
            {canEditContent ? (
              <ActionForm
                action={applyCopyDraftAction.bind(null, projectId, g.id)}
                submitLabel="Crear versión con este texto"
                className="grid gap-2"
              >
                {email && (
                  <>
                    <label className="field">
                      Asunto
                      <input name="emailSubject" className="input" defaultValue={email.subject} />
                    </label>
                    <label className="field">
                      Preencabezado
                      <input name="emailPreheader" className="input" defaultValue={email.preheader} />
                    </label>
                  </>
                )}
                <label className="field">
                  Texto (puedes editarlo antes de guardarlo)
                  <textarea
                    name="body"
                    className="input min-h-40 font-mono text-sm"
                    defaultValue={email ? email.body : g.output}
                  />
                </label>
              </ActionForm>
            ) : (
              <pre className="whitespace-pre-wrap rounded-md bg-background p-3 font-sans text-sm">{g.output}</pre>
            )}
            {hasPermission(ctx, "ai.generate") && (
              <ActionForm
                action={resolveGenerationAction.bind(null, projectId, g.id, "discarded")}
                submitLabel="Descartar"
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
          <summary className="cursor-pointer">Borradores anteriores ({past.length})</summary>
          <ul className="mt-2 flex flex-col gap-3">
            {past.map((g) => (
              <li key={g.id} className="flex flex-col gap-1">
                <AiGenerationMeta generation={g} tz={tz} />
                {g.status === "failed" ? (
                  <p className="text-red-700">{g.error}</p>
                ) : (
                  <pre className="whitespace-pre-wrap font-sans text-muted">{g.output}</pre>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
