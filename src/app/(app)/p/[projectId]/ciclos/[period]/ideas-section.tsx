import { ActionForm } from "@/components/action-form";
import { AiGenerationMeta } from "@/components/ai-generation-meta";
import { hasPermission, type ProjectContext } from "@/modules/access/context";
import { getAiStatus, listGenerations } from "@/modules/ai/service";
import { generateIdeasAction, resolveGenerationAction } from "../../ai-actions";

/** Ideas de contenido con IA para el mes. Son solo texto: no crean piezas. */
export async function IdeasSection({
  ctx,
  projectId,
  cycleId,
  writable,
  tz,
}: {
  ctx: ProjectContext;
  projectId: string;
  cycleId: string;
  writable: boolean;
  tz: string;
}) {
  const [status, generations] = await Promise.all([
    getAiStatus(ctx),
    listGenerations(ctx, { cycleId, purpose: "ideas" }),
  ]);
  if (!status.enabled && generations.length === 0) return null;
  const canGenerate = status.enabled && status.configured && writable && hasPermission(ctx, "ai.generate");
  const drafts = generations.filter((g) => g.status === "draft");
  const past = generations.filter((g) => g.status !== "draft");

  return (
    <section className="card flex flex-col gap-3" aria-label="Ideas con IA">
      <h2 className="h2">Ideas con IA</h2>
      <p className="text-sm text-muted">
        Propuestas a partir del brief y de lo ya planificado. Si una idea te sirve, crea la pieza a mano.
      </p>
      {status.enabled && !status.configured && (
        <p className="text-sm text-muted">La IA no está configurada en el servidor.</p>
      )}
      {canGenerate && (
        <ActionForm action={generateIdeasAction.bind(null, projectId, cycleId)} submitLabel="Proponer ideas">
          <label className="field grow">
            Indicaciones (opcional)
            <input name="instructions" className="input" placeholder="Más vídeo corto; campaña de Navidad" />
          </label>
        </ActionForm>
      )}
      {drafts.map((g) => (
        <div key={g.id} className="flex flex-col gap-2 rounded-md border border-violet-200 p-3">
          <AiGenerationMeta generation={g} tz={tz} />
          <pre className="whitespace-pre-wrap font-sans text-sm">{g.output}</pre>
          {hasPermission(ctx, "ai.generate") && (
            <div className="flex flex-wrap gap-2">
              <ActionForm
                action={resolveGenerationAction.bind(null, projectId, g.id, "used")}
                submitLabel="Marcar como aprovechadas"
                variant="secondary"
              >
                {null}
              </ActionForm>
              <ActionForm
                action={resolveGenerationAction.bind(null, projectId, g.id, "discarded")}
                submitLabel="Descartar"
                variant="secondary"
              >
                {null}
              </ActionForm>
            </div>
          )}
        </div>
      ))}
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
