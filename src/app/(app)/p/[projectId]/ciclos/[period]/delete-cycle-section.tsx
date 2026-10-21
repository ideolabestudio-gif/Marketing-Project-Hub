import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { CollapsibleCard } from "@/components/collapsible-card";
import type { ProjectContext } from "@/modules/access/context";
import { getCycleContents } from "@/modules/cycles/service";
import { deleteCycleAction } from "./actions";

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Eliminar el ciclo entero (p. ej. uno de prueba). Va plegado, al final de la página. */
export async function DeleteCycleSection({
  ctx,
  projectId,
  cycleId,
  period,
  periodLabel,
  closed,
  reportApproved,
}: {
  ctx: ProjectContext;
  projectId: string;
  cycleId: string;
  period: string;
  periodLabel: string;
  closed: boolean;
  reportApproved: boolean;
}) {
  const c = await getCycleContents(ctx, cycleId);
  const losses = [
    c.items > 0 && plural(c.items, "pieza", "piezas"),
    c.versions > 0 && plural(c.versions, "versión de texto y archivos", "versiones de texto y archivos"),
    c.approvals > 0 && plural(c.approvals, "aprobación registrada", "aprobaciones registradas"),
    c.publications > 0 &&
      plural(c.publications, "programación o publicación registrada", "programaciones o publicaciones registradas"),
    c.comments > 0 && plural(c.comments, "comentario", "comentarios"),
    c.aiGenerations > 0 && plural(c.aiGenerations, "propuesta o borrador con IA", "propuestas y borradores con IA"),
    (c.metricValues > 0 || c.metricImports > 0) &&
      `las métricas del mes (${plural(c.metricValues, "dato", "datos")}, ${plural(c.metricImports, "importación", "importaciones")})`,
    c.hasReport && "el informe del mes",
  ].filter((x): x is string => Boolean(x));

  return (
    <CollapsibleCard title="Eliminar este ciclo" hint="Para quitar un mes de prueba o creado por error. No se puede deshacer.">
      {closed ? (
        <p className="text-sm text-muted">El ciclo está cerrado. Para eliminarlo, reábrelo primero (arriba).</p>
      ) : reportApproved ? (
        <p className="text-sm text-muted">
          El <Link href={`/p/${projectId}/ciclos/${period}/informe`} className="link">informe</Link> está aprobado. Para
          eliminar el ciclo, reabre antes el informe.
        </p>
      ) : (
        <>
          <div className="rounded-lg border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">
            <p className="font-medium">Se borrará el ciclo de {periodLabel} con todo lo que contiene. No se podrá recuperar.</p>
            {losses.length > 0 ? (
              <ul className="mt-1.5 list-disc pl-5">
                {losses.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-1">El ciclo está vacío: no tiene piezas, métricas ni informe.</p>
            )}
            {c.publications > 0 && (
              <p className="mt-1.5">
                Lo que ya esté programado en Metricool, publicado o enviado no se toca: solo se borra su registro en el Hub.
              </p>
            )}
          </div>
          <p className="text-sm text-muted">
            Quedará constancia en la auditoría de quién lo eliminó y cuándo. Los archivos que también estén en la
            biblioteca de marca se conservan.
          </p>
          <ActionForm
            action={deleteCycleAction.bind(null, projectId, cycleId)}
            submitLabel="Eliminar ciclo"
            variant="danger"
            className="grid gap-3"
          >
            <label className="field">
              <span>
                Para confirmar, escribe <strong className="font-mono">{period}</strong>
              </span>
              <input
                name="confirmation"
                className="input font-mono"
                required
                pattern={period}
                autoComplete="off"
                placeholder={period}
              />
            </label>
          </ActionForm>
        </>
      )}
    </CollapsibleCard>
  );
}
