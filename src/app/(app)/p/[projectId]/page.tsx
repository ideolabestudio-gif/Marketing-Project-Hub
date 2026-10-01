import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { projectContextForPage } from "@/lib/project-page";
import { formatPeriod, nextPeriod } from "@/lib/time";
import { hasPermission } from "@/modules/access/context";
import { ROLE_LABELS } from "@/modules/access/permissions";
import { listProjectMembers } from "@/modules/access/service";
import { PLATFORMS } from "@/modules/projects/catalog";
import { CYCLE_STATUS_LABELS, listCycles } from "@/modules/cycles/service";
import { getProject, listChannels } from "@/modules/projects/service";
import { openCycleAction } from "./actions";

export default async function ProjectPage({ params }: PageProps<"/p/[projectId]">) {
  const { projectId } = await params;
  const ctx = await projectContextForPage(projectId);
  const [project, channels, members, cycles] = await Promise.all([
    getProject(ctx),
    listChannels(ctx),
    listProjectMembers(ctx),
    listCycles(ctx),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-muted">{project.clientName}</div>
          <h1 className="h1">{project.name}</h1>
          <div className="mt-2 flex gap-2">
            <span className="badge">Tu rol: {ROLE_LABELS[ctx.role]}</span>
            <span className="badge">Zona horaria: {project.timezone}</span>
            {project.status === "archived" && <span className="badge">Archivado · solo lectura</span>}
          </div>
        </div>
        {hasPermission(ctx, "project.settings") && (
          <Link href={`/p/${projectId}/ajustes`} className="btn btn-secondary">
            Ajustes
          </Link>
        )}
      </div>

      <section className="card flex flex-col gap-3">
        <h2 className="h2">Ciclos mensuales</h2>
        {cycles.length === 0 ? (
          <p className="text-sm text-muted">Todavía no hay ciclos.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {cycles.map((c) => (
              <li key={c.id} className="flex items-center justify-between py-2">
                <Link href={`/p/${projectId}/ciclos/${c.period}`} className="link font-medium">
                  {formatPeriod(c.period, project.locale)}
                </Link>
                <span className="badge">{CYCLE_STATUS_LABELS[c.status]}</span>
              </li>
            ))}
          </ul>
        )}
        {hasPermission(ctx, "cycle.manage") && (
          <ActionForm action={openCycleAction.bind(null, projectId)} submitLabel="Abrir ciclo">
            <label className="field">
              Mes
              <input
                type="month"
                name="period"
                className="input"
                defaultValue={nextPeriod(new Date(), project.timezone)}
                required
              />
            </label>
          </ActionForm>
        )}
      </section>

      <section className="card">
        <h2 className="h2">Canales</h2>
        {channels.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Sin canales configurados.</p>
        ) : (
          <table className="table mt-3">
            <thead>
              <tr>
                <th>Canal</th>
                <th>Plataforma</th>
                <th>Cuenta / lista</th>
                <th>Modo</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {channels.map((c) => (
                <tr key={c.id}>
                  <td>{c.displayName}</td>
                  <td>{PLATFORMS[c.platform as keyof typeof PLATFORMS]?.label ?? c.platform}</td>
                  <td>{c.handle ?? "—"}</td>
                  <td>{c.mode === "manual" ? "Manual" : "Integración"}</td>
                  <td>{c.isActive ? "Activo" : "Inactivo"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card">
        <h2 className="h2">Equipo</h2>
        <table className="table mt-3">
          <thead>
            <tr>
              <th>Persona</th>
              <th>Rol</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.userId}>
                <td>
                  {m.name ?? m.email} {m.name && <span className="text-muted">· {m.email}</span>}
                  {!m.isActive && <span className="badge ml-2">Desactivado</span>}
                </td>
                <td>{ROLE_LABELS[m.role]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

    </div>
  );
}
