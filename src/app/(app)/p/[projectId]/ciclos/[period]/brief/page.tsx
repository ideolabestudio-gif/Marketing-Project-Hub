import { ActionForm } from "@/components/action-form";
import { Breadcrumbs, cycleCrumbs } from "@/components/breadcrumbs";
import { orNotFound, projectContextForPage } from "@/lib/project-page";
import { formatPeriod } from "@/lib/time";
import { hasPermission } from "@/modules/access/context";
import { getCycleByPeriod } from "@/modules/cycles/service";
import { getProject } from "@/modules/projects/service";
import { updateBriefAction } from "../actions";

import type { Metadata } from "next";
import { cycleTitle } from "@/lib/page-title";

export async function generateMetadata({ params }: PageProps<"/p/[projectId]/ciclos/[period]/brief">): Promise<Metadata> {
  const { projectId, period } = await params;
  return cycleTitle(projectId, period, "Brief");
}

export default async function BriefPage({ params }: PageProps<"/p/[projectId]/ciclos/[period]/brief">) {
  const { projectId, period } = await params;
  const ctx = await projectContextForPage(projectId);
  const cycle = await orNotFound(getCycleByPeriod(ctx, period));
  const project = await getProject(ctx);
  const canManage = hasPermission(ctx, "cycle.manage") && cycle.status !== "closed";
  const monthLabel = formatPeriod(cycle.period, project.locale);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Breadcrumbs help="mes" items={cycleCrumbs(projectId, project.name, period, monthLabel)} />
        <h1 className="h1 mt-1">Brief del mes</h1>
        <p className="mt-1 text-sm text-muted">
          Objetivos, fechas clave y notas de {monthLabel.toLocaleLowerCase(project.locale)}. Se incluye en los textos que
          el Hub prepara para Claude (calendario, ideas y borradores).
        </p>
      </div>

      <section className="card flex flex-col gap-3">
        {canManage ? (
          <ActionForm action={updateBriefAction.bind(null, projectId, cycle.id)} submitLabel="Guardar brief" className="grid gap-3">
            <label className="field">
              Objetivos
              <textarea name="objectives" className="input min-h-24" defaultValue={cycle.objectives ?? ""} />
            </label>
            <label className="field">
              Fechas clave
              <textarea name="keyDates" className="input min-h-20" defaultValue={cycle.keyDates ?? ""} />
            </label>
            <label className="field">
              Notas
              <textarea name="notes" className="input min-h-20" defaultValue={cycle.notes ?? ""} />
            </label>
          </ActionForm>
        ) : (
          <dl className="grid gap-2 text-sm">
            <dt className="text-muted">Objetivos</dt>
            <dd className="whitespace-pre-wrap">{cycle.objectives || "—"}</dd>
            <dt className="text-muted">Fechas clave</dt>
            <dd className="whitespace-pre-wrap">{cycle.keyDates || "—"}</dd>
            <dt className="text-muted">Notas</dt>
            <dd className="whitespace-pre-wrap">{cycle.notes || "—"}</dd>
          </dl>
        )}
      </section>
    </div>
  );
}
