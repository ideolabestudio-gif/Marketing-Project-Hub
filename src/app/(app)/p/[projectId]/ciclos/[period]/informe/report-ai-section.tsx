import { ActionForm } from "@/components/action-form";
import { AiGenerationMeta } from "@/components/ai-generation-meta";
import { CollapsibleCard } from "@/components/collapsible-card";
import { CopyButton } from "@/components/copy-button";
import { hasPermission, type ProjectContext } from "@/modules/access/context";
import { getAiStatus, getReportInterpretationChatPrompt, listGenerations } from "@/modules/ai/service";
import {
  applyInterpretationAction,
  generateInterpretationAction,
  importInterpretationAction,
  resolveGenerationAction,
} from "../../../ai-actions";

/**
 * Lectura de los resultados con Claude. Funciona sin API: con el conector del Hub en
 * Claude o copiando y pegando. Lo que llega es un borrador; solo entra en el informe
 * cuando una persona lo añade, y allí hay que revisarlo antes de aprobar.
 */
export async function ReportAiSection({
  ctx,
  projectId,
  cycleId,
  monthLabel,
  projectName,
  tz,
}: {
  ctx: ProjectContext;
  projectId: string;
  cycleId: string;
  /** «octubre de 2026» */
  monthLabel: string;
  projectName: string;
  tz: string;
}) {
  const canAsk = hasPermission(ctx, "ai.generate");
  const [status, generations, chatPrompt] = await Promise.all([
    getAiStatus(ctx),
    listGenerations(ctx, { cycleId, purpose: "report_interpretation" }),
    canAsk ? getReportInterpretationChatPrompt(ctx, { cycleId }).catch(() => null) : null,
  ]);
  const drafts = generations.filter((g) => g.status === "draft");
  const canGenerate = status.enabled && status.configured && canAsk;
  if (!canAsk && drafts.length === 0) return null;
  const request = `Prepara el análisis del informe de ${monthLabel} del proyecto «${projectName}» en Marketing Project Hub.`;

  return (
    <CollapsibleCard
      id="lectura-ia"
      title="Lectura de los resultados con Claude"
      hint={
        drafts.length > 0
          ? drafts.length === 1
            ? "Hay 1 lectura pendiente de revisar."
            : `Hay ${drafts.length} lecturas pendientes de revisar.`
          : "Claude lee las métricas registradas y propone un texto; tú decides si entra."
      }
      defaultOpen={drafts.length > 0}
    >
      <p className="text-sm text-muted">
        Claude recibe solo las métricas registradas de este proyecto y las publicaciones del mes. Si añades su texto al
        informe, aparece marcado como asistido por IA y hay que revisarlo antes de aprobar.
      </p>

      {canGenerate && (
        <ActionForm action={generateInterpretationAction.bind(null, projectId, cycleId)} submitLabel="Generar lectura">
          <label className="field grow">
            Indicaciones (opcional)
            <input name="instructions" className="input" placeholder="Céntrate en Instagram" />
          </label>
        </ActionForm>
      )}

      {canAsk && (
        <div className="flex flex-col gap-2 rounded-md border border-border p-3 text-sm">
          <p className="font-medium">Con el conector del Hub en Claude</p>
          <p className="text-muted">
            Escríbele esto en un chat (puedes añadir indicaciones). El borrador aparecerá aquí al recargar la página.
          </p>
          <p className="rounded-md bg-surface-muted px-3 py-2">{request}</p>
          <CopyButton text={request} label="Copiar petición" />
        </div>
      )}

      {chatPrompt && (
        <details className="flex flex-col gap-3 rounded-md border border-border p-3">
          <summary className="text-sm font-medium text-foreground">Sin conector: copiar y pegar</summary>
          <ol className="mt-3 flex list-decimal flex-col gap-3 pl-5 text-sm">
            <li className="flex flex-col gap-2">
              Copia este texto y pégalo en un chat nuevo de Claude.
              <textarea readOnly className="input font-mono text-xs" rows={6} value={chatPrompt} />
              <CopyButton text={chatPrompt} label="Copiar texto para Claude" />
            </li>
            <li className="flex flex-col gap-2">
              Pega aquí la respuesta del chat.
              <ActionForm
                action={importInterpretationAction.bind(null, projectId, cycleId)}
                submitLabel="Guardar lectura"
                className="grid gap-3"
              >
                <textarea name="output" className="input" rows={6} required />
              </ActionForm>
            </li>
          </ol>
        </details>
      )}

      {drafts.map((g) => (
        <div key={g.id} className="ai-box">
          <AiGenerationMeta generation={g} tz={tz} />
          {g.unverifiedNumbers.length > 0 && (
            <p className="notice">
              Cifras que no están en los datos registrados: {g.unverifiedNumbers.join(", ")}. Corrígelas o quítalas.
            </p>
          )}
          <ActionForm
            action={applyInterpretationAction.bind(null, projectId, g.id)}
            submitLabel="Añadir al informe"
            className="grid gap-2"
          >
            <label className="field">
              Título de la sección
              <input name="title" className="input" defaultValue="Lectura de los resultados" required />
            </label>
            <label className="field">
              Texto (puedes editarlo)
              <textarea name="body" className="input min-h-40" defaultValue={g.output} />
            </label>
          </ActionForm>
          <ActionForm
            action={resolveGenerationAction.bind(null, projectId, g.id, "discarded")}
            submitLabel="Descartar"
            variant="secondary"
          >
            {null}
          </ActionForm>
        </div>
      ))}
    </CollapsibleCard>
  );
}
