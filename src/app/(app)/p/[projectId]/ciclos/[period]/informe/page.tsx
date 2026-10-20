import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { ReportBody, type SectionTools } from "@/components/report-body";
import { orNotFound, projectContextForPage } from "@/lib/project-page";
import { formatInZone, formatPeriod } from "@/lib/time";
import { hasPermission } from "@/modules/access/context";
import { getCycleByPeriod } from "@/modules/cycles/service";
import { getProject, listChannels } from "@/modules/projects/service";
import {
  getReport,
  getReportView,
  SECTION_KIND_LABELS,
  type ReportCheck,
  type ReportSection,
} from "@/modules/reports/service";
import {
  addSectionAction,
  approveReportAction,
  createReportAction,
  deleteSectionAction,
  markAiSectionReviewedAction,
  moveSectionAction,
  reopenReportAction,
  updateSectionAction,
} from "./actions";
import { ReportAiSection } from "./report-ai-section";

type Channel = Awaited<ReturnType<typeof listChannels>>[number];

function SectionFields({ section, channels }: { section?: ReportSection; channels: Channel[] }) {
  const kind = section?.kind;
  return (
    <>
      <label className="field">
        Título
        <input name="title" className="input" defaultValue={section?.title ?? ""} required />
      </label>
      {(kind === undefined || kind === "data") && (
        <label className="field">
          Canal {kind === undefined && "(solo secciones de datos)"}
          <select name="channelId" className="input" defaultValue={section?.channelId ?? ""}>
            <option value="">Todos los canales</option>
            {channels.map((c) => (
              <option key={c.id} value={c.id}>
                {c.displayName}
              </option>
            ))}
          </select>
        </label>
      )}
      {(kind === undefined || kind === "human_analysis" || kind === "ai_interpretation") && (
        <label className="field">
          Texto {kind === undefined && "(solo secciones de análisis)"}
          <textarea name="body" className="input min-h-32" defaultValue={section?.body ?? ""} />
        </label>
      )}
      {(kind === undefined || kind === "data") && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="comparePrevious" defaultChecked={section?.comparePrevious ?? true} />
          Comparar con el mes anterior
        </label>
      )}
      {(kind === undefined || kind === "data") && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="showEmptyMetrics" defaultChecked={section?.showEmptyMetrics ?? false} />
          Mostrar también las métricas sin dato
        </label>
      )}
    </>
  );
}

/** Lo que falta antes de aprobar, con enlace a donde se arregla. */
function ApprovalChecklist({ checks, base }: { checks: ReportCheck[]; base: string }) {
  if (checks.length === 0) return <p className="text-sm text-success">✓ Todo listo para aprobar.</p>;
  return (
    <ul className="flex flex-col gap-2 text-sm">
      {checks.map((c, i) => (
        <li key={i} className="flex flex-wrap items-baseline gap-x-2">
          <span aria-hidden className={c.level === "required" ? "text-danger" : "text-warning-ink"}>
            {c.level === "required" ? "●" : "▲"}
          </span>
          <span>
            {c.message}
            {c.level === "warning" && <span className="text-muted"> (no impide aprobar)</span>}
          </span>
          {c.fix === "metrics" ? (
            <Link href={`${base}/metricas`} className="link">
              Registrar o importar métricas
            </Link>
          ) : c.fix === "cycle" ? (
            <Link href={base} className="link">
              Ir al calendario
            </Link>
          ) : c.sectionId ? (
            <a href={`#seccion-${c.sectionId}`} className="link">
              Ir a la sección
            </a>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export default async function ReportPage({ params }: PageProps<"/p/[projectId]/ciclos/[period]/informe">) {
  const { projectId, period } = await params;
  const ctx = await projectContextForPage(projectId);
  const cycle = await orNotFound(getCycleByPeriod(ctx, period));
  const [project, channels, current] = await Promise.all([getProject(ctx), listChannels(ctx), getReport(ctx, cycle.id)]);
  const base = `/p/${projectId}/ciclos/${period}`;
  const closed = cycle.status === "closed";
  const canWrite = hasPermission(ctx, "report.write") && !closed;
  const canApprove = hasPermission(ctx, "report.approve") && !closed;

  const header = (
    <div>
      <Link href={base} className="link text-sm">
        ← {formatPeriod(cycle.period, project.locale)}
      </Link>
      <h1 className="h1 mt-1">Informe del mes</h1>
    </div>
  );

  if (!current) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <section className="card flex flex-col gap-3">
          <p className="text-sm">Este ciclo todavía no tiene informe.</p>
          {canWrite ? (
            <ActionForm action={createReportAction.bind(null, projectId, cycle.id)} submitLabel="Crear informe">
              <span className="text-sm text-muted">
                Se crea con una estructura propuesta (resumen, datos de cada canal, contenido publicado y conclusiones)
                que puedes cambiar.
              </span>
            </ActionForm>
          ) : (
            <p className="text-sm text-muted">Lo crea una persona con permiso para redactar informes.</p>
          )}
        </section>
      </div>
    );
  }

  const { report, sections } = current;
  const approved = report.status === "approved";
  const editable = canWrite && !approved;
  const view = await getReportView(ctx, cycle.id);
  const activeChannels = channels.filter((c) => c.isActive || sections.some((s) => s.channelId === c.id));
  const blocking = view.checks.filter((c) => c.level === "required").length;
  const tz = project.timezone;

  // Edición en su sitio: cada sección del informe lleva su barra y su formulario plegable.
  const tools: Record<string, SectionTools> | undefined = editable
    ? Object.fromEntries(
        sections.map((s, i) => {
          const hasText = s.kind === "human_analysis" || s.kind === "ai_interpretation";
          const bar = (
            <div className="no-print flex flex-wrap items-center gap-2">
              <span className={s.kind === "ai_interpretation" ? "badge-ai" : "badge"}>{SECTION_KIND_LABELS[s.kind]}</span>
              {s.kind === "ai_interpretation" &&
                (s.reviewedAt ? (
                  <span className="text-xs text-success">Revisada el {formatInZone(s.reviewedAt, tz)}</span>
                ) : (
                  <ActionForm
                    action={markAiSectionReviewedAction.bind(null, projectId, s.id)}
                    submitLabel="La he revisado"
                    variant="secondary"
                  >
                    <span className="text-xs text-warning-ink">Sin revisar: compruébala contra los datos.</span>
                  </ActionForm>
                ))}
              <div className="ml-auto flex gap-2">
                {i > 0 && (
                  <ActionForm action={moveSectionAction.bind(null, projectId, s.id, "up")} submitLabel="↑" variant="secondary">
                    {null}
                  </ActionForm>
                )}
                {i < sections.length - 1 && (
                  <ActionForm action={moveSectionAction.bind(null, projectId, s.id, "down")} submitLabel="↓" variant="secondary">
                    {null}
                  </ActionForm>
                )}
                <ActionForm action={deleteSectionAction.bind(null, projectId, s.id)} submitLabel="Eliminar" variant="danger">
                  {null}
                </ActionForm>
              </div>
            </div>
          );
          const editor = (
            <details className="no-print" open={hasText && !s.body?.trim()}>
              <summary className="text-sm">Editar sección</summary>
              <ActionForm
                action={updateSectionAction.bind(null, projectId, s.id)}
                submitLabel="Guardar sección"
                className="mt-3 grid gap-3"
              >
                <SectionFields section={s} channels={activeChannels} />
              </ActionForm>
            </details>
          );
          return [s.id, { bar, editor }];
        }),
      )
    : undefined;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          {header}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="badge">{approved ? "Aprobado" : "Borrador"}</span>
            <span className="badge">{sections.length} secciones</span>
            {approved && report.approvedAt && (
              <span className="text-sm text-muted">Aprobado el {formatInZone(report.approvedAt, tz)}</span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <Link href={`${base}/informe/imprimir`} className="btn btn-secondary">
            Ver para imprimir / PDF
          </Link>
          {canApprove && approved && (
            <ActionForm
              action={reopenReportAction.bind(null, projectId, report.id)}
              submitLabel="Reabrir informe"
              variant="secondary"
            >
              <input name="reason" className="input" placeholder="Motivo" required />
            </ActionForm>
          )}
        </div>
      </div>

      {!approved && (canWrite || canApprove) && (
        <section className="card flex flex-col gap-3" aria-label="Antes de aprobar">
          <div>
            <h2 className="h2">Antes de aprobar</h2>
            <p className="mt-0.5 text-sm text-muted">
              Lo marcado con ● hay que resolverlo; lo marcado con ▲ es un aviso. Al aprobar, el informe queda bloqueado.
            </p>
          </div>
          <ApprovalChecklist checks={view.checks} base={base} />
          {canApprove &&
            (blocking > 0 ? (
              <button type="button" className="btn btn-primary self-start" disabled>
                Aprobar informe
              </button>
            ) : (
              <ActionForm action={approveReportAction.bind(null, projectId, report.id)} submitLabel="Aprobar informe">
                {null}
              </ActionForm>
            ))}
        </section>
      )}

      {editable && (
        <ReportAiSection
          ctx={ctx}
          projectId={projectId}
          cycleId={cycle.id}
          monthLabel={formatPeriod(cycle.period, project.locale).toLowerCase()}
          projectName={project.name}
          tz={tz}
        />
      )}

      <section className="flex flex-col gap-3" aria-label="Informe">
        {editable && (
          <p className="text-sm text-muted">
            Así lo verá el cliente. Cambia cada sección con «Editar sección»; las marcas de edición no salen en el PDF.
          </p>
        )}
        <div className="card report-paper mx-auto w-full max-w-3xl sm:p-10">
          <ReportBody view={view} tools={tools}>
            {editable && (
              <details className="no-print rounded-lg border border-dashed border-border-strong p-3">
                <summary className="text-sm font-medium">Añadir sección</summary>
                <ActionForm
                  action={addSectionAction.bind(null, projectId, report.id)}
                  submitLabel="Añadir sección"
                  className="mt-3 grid gap-3"
                >
                  <label className="field">
                    Tipo
                    <select name="kind" className="input" defaultValue="human_analysis">
                      {Object.entries(SECTION_KIND_LABELS)
                        .filter(([k]) => k !== "ai_interpretation")
                        .map(([k, label]) => (
                          <option key={k} value={k}>
                            {label}
                          </option>
                        ))}
                    </select>
                  </label>
                  <SectionFields channels={activeChannels} />
                </ActionForm>
              </details>
            )}
          </ReportBody>
        </div>
      </section>
    </div>
  );
}
