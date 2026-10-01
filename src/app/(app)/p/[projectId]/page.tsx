import Link from "next/link";
import { projectContextForPage } from "@/lib/project-page";
import { hasPermission } from "@/modules/access/context";
import { ROLE_LABELS } from "@/modules/access/permissions";
import { listProjectMembers } from "@/modules/access/service";
import { PLATFORMS } from "@/modules/projects/catalog";
import { getProject, listChannels } from "@/modules/projects/service";

export default async function ProjectPage({ params }: PageProps<"/p/[projectId]">) {
  const { projectId } = await params;
  const ctx = await projectContextForPage(projectId);
  const [project, channels, members] = await Promise.all([
    getProject(ctx),
    listChannels(ctx),
    listProjectMembers(ctx),
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

      <section className="card text-sm text-muted">
        El ciclo mensual (planificación, contenidos, aprobación, métricas e informe) llega en las
        siguientes fases del plan.
      </section>
    </div>
  );
}
