import { orNotFound, projectContextForPage } from "@/lib/project-page";
import { formatPeriod } from "@/lib/time";
import { getCycleByPeriod, listCycles } from "@/modules/cycles/service";
import { getProject } from "@/modules/projects/service";
import { getReport } from "@/modules/reports/service";
import { CycleNav } from "./cycle-nav";

/** Menú común de las páginas de un mes: Plan, Brief, Métricas e Informe, y paso al mes anterior o siguiente. */
export default async function CycleLayout({ params, children }: LayoutProps<"/p/[projectId]/ciclos/[period]">) {
  const { projectId, period } = await params;
  const ctx = await projectContextForPage(projectId);
  const cycle = await orNotFound(getCycleByPeriod(ctx, period));
  const [project, cycles, report] = await Promise.all([getProject(ctx), listCycles(ctx), getReport(ctx, cycle.id)]);
  const sorted = [...cycles].sort((a, b) => a.period.localeCompare(b.period));
  const at = sorted.findIndex((c) => c.id === cycle.id);
  const link = (c: (typeof sorted)[number] | undefined) =>
    c ? { href: `/p/${projectId}/ciclos/${c.period}`, label: formatPeriod(c.period, project.locale) } : null;
  const reportHint = !report ? "sin crear" : report.report.status === "approved" ? "aprobado" : "borrador";

  return (
    <div className="flex flex-col gap-6">
      <CycleNav
        base={`/p/${projectId}/ciclos/${cycle.period}`}
        label={formatPeriod(cycle.period, project.locale)}
        prev={link(sorted[at - 1])}
        next={link(sorted[at + 1])}
        reportHint={reportHint}
      />
      {children}
    </div>
  );
}
