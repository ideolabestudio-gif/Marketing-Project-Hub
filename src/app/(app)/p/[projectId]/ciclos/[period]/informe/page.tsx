import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { AiGenerationMeta } from "@/components/ai-generation-meta";
import { ReportBody } from "@/components/report-body";
import { orNotFound, projectContextForPage } from "@/lib/project-page";
import { formatInZone, formatPeriod } from "@/lib/time";
import { hasPermission } from "@/modules/access/context";
import { getAiStatus, listGenerations } from "@/modules/ai/service";
import { getCycleByPeriod } from "@/modules/cycles/service";
import { getProject, listChannels } from "@/modules/projects/service";
import { getReport, getReportView, SECTION_KIND_LABELS, type ReportSection } from "@/modules/reports/service";
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
import { applyInterpretationAction, generateInterpretationAction, resolveGenerationAction } from "../../../ai-actions";

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
    </>
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
  const [view, ai, interpretations] = await Promise.all([
    getReportView(ctx, cycle.id),
    getAiStatus(ctx),
    listGenerations(ctx, { cycleId: cycle.id, purpose: "report_interpretation" }),
  ]);
  const drafts = interpretations.filter((g) => g.status === "draft");
  const canGenerate = ai.enabled && ai.configured && editable && hasPermission(ctx, "ai.generate");
  const activeChannels = channels.filter((c) => c.isActive || sections.some((s) => s.channelId === c.id));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          {header}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="badge">{approved ? "Aprobado" : "Borrador"}</span>
            <span className="badge">{sections.length} secciones</span>
            {approved && report.approvedAt && (
              <span className="text-sm text-muted">Aprobado el {formatInZone(report.approvedAt, project.timezone)}</span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <Link href={`${base}/informe/imprimir`} className="btn btn-secondary">
            Ver para imprimir / PDF
          </Link>
          {canApprove && !approved && (
            <ActionForm action={approveReportAction.bind(null, projectId, report.id)} submitLabel="Aprobar informe">
              <span className="text-sm text-muted">Al aprobarlo queda bloqueado.</span>
            </ActionForm>
          )}
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

      {editable && (
        <section className="card flex flex-col gap-4">
          <div>
            <h2 className="h2">Secciones</h2>
            <p className="mt-0.5 text-sm text-muted">Edita el texto y el orden; la vista previa de abajo es lo que verá el cliente.</p>
          </div>
          {sections.map((s, i) => (
            <div key={s.id} className="tile flex flex-col gap-3" aria-label={`Sección ${s.title}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-muted tabular-nums">{i + 1}.</span>
                <span className={s.kind === "ai_interpretation" ? "badge-ai" : "badge"}>
                  {SECTION_KIND_LABELS[s.kind]}
                </span>
                {s.kind === "ai_interpretation" &&
                  (s.reviewedAt ? (
                    <span className="text-xs text-success">Revisada el {formatInZone(s.reviewedAt, project.timezone)}</span>
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
              <ActionForm
                action={updateSectionAction.bind(null, projectId, s.id)}
                submitLabel="Guardar sección"
                className="grid gap-3"
              >
                <SectionFields section={s} channels={activeChannels} />
              </ActionForm>
            </div>
          ))}
          <div className="flex flex-col gap-3 rounded-lg border border-dashed border-border-strong p-3">
            <h3 className="eyebrow">Añadir sección</h3>
            <ActionForm action={addSectionAction.bind(null, projectId, report.id)} submitLabel="Añadir sección" className="grid gap-3">
              <label className="field">
                Tipo
                <select name="kind" className="input" defaultValue="human_analysis">
                  {Object.entries(SECTION_KIND_LABELS).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <SectionFields channels={activeChannels} />
            </ActionForm>
          </div>
        </section>
      )}

      {(canGenerate || (editable && drafts.length > 0)) && (
        <section className="card flex flex-col gap-3" aria-label="Interpretación con IA">
          <h2 className="h2">Interpretación con IA</h2>
          <p className="text-sm text-muted">
            La IA recibe solo las métricas registradas de este proyecto (y las publicaciones del mes) y propone una
            lectura. Si la añades al informe, aparece marcada como asistida por IA y hay que revisarla antes de aprobar.
          </p>
          {canGenerate && (
            <ActionForm action={generateInterpretationAction.bind(null, projectId, cycle.id)} submitLabel="Generar interpretación">
              <label className="field grow">
                Indicaciones (opcional)
                <input name="instructions" className="input" placeholder="Céntrate en Instagram" />
              </label>
            </ActionForm>
          )}
          {drafts.map((g) => (
            <div key={g.id} className="ai-box">
              <AiGenerationMeta generation={g} tz={project.timezone} />
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
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="h2">Vista previa</h2>
        <div className="card report-paper mx-auto w-full max-w-3xl sm:p-10">
          <ReportBody view={view} />
        </div>
      </section>
    </div>
  );
}
