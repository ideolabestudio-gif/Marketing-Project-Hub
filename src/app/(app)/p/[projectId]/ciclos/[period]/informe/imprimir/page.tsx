import Link from "next/link";
import { PrintButton } from "@/components/print-button";
import { ReportBody } from "@/components/report-body";
import { orNotFound, projectContextForPage } from "@/lib/project-page";
import { getCycleByPeriod } from "@/modules/cycles/service";
import { getReportView } from "@/modules/reports/service";

/** Vista limpia del informe para imprimir o guardar como PDF desde el navegador. */
export default async function PrintReportPage({ params }: PageProps<"/p/[projectId]/ciclos/[period]/informe/imprimir">) {
  const { projectId, period } = await params;
  const ctx = await projectContextForPage(projectId);
  const cycle = await orNotFound(getCycleByPeriod(ctx, period));
  const view = await orNotFound(getReportView(ctx, cycle.id));
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="no-print flex flex-wrap items-center gap-3">
        <Link href={`/p/${projectId}/ciclos/${period}/informe`} className="link text-sm">
          ← Volver al informe
        </Link>
        <PrintButton />
        <span className="text-sm text-muted">En el diálogo de impresión elige «Guardar como PDF».</span>
      </div>
      <ReportBody view={view} />
    </div>
  );
}
