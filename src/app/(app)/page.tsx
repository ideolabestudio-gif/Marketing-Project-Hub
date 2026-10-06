import Link from "next/link";
import { ROLE_LABELS } from "@/modules/access/permissions";
import { listMyProjects } from "@/modules/access/service";
import { requireActor } from "@/modules/identity/next";
import { formatInZone, formatPeriod } from "@/lib/time";
import { WORKFLOW_LABELS } from "@/modules/review/domain";
import { listMyPendingWork, PENDING_ACTION_LABELS } from "@/modules/review/service";

export default async function HomePage() {
  const actor = await requireActor();
  const [projects, pending] = await Promise.all([listMyProjects(actor), listMyPendingWork(actor)]);

  return (
    <div className="flex flex-col gap-6">
      {pending.length > 0 && (
        <section className="card flex flex-col gap-3">
          <h2 className="h2">Pendiente de mí ({pending.length})</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Qué hacer</th>
                <th>Pieza</th>
                <th>Cliente · proyecto</th>
                <th>Fecha prevista</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {pending.map((p) => (
                <tr key={p.itemId}>
                  <td className="font-medium">{PENDING_ACTION_LABELS[p.action]}</td>
                  <td>
                    <Link href={`/p/${p.projectId}/ciclos/${p.period}/piezas/${p.itemId}`} className="link">
                      {p.title}
                    </Link>
                  </td>
                  <td>
                    {p.clientName} · {p.projectName}
                    <span className="block text-xs text-muted">{formatPeriod(p.period)}</span>
                  </td>
                  <td className="whitespace-nowrap">{p.plannedAt ? formatInZone(p.plannedAt, p.timezone) : "—"}</td>
                  <td>{WORKFLOW_LABELS[p.status]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <h1 className="h1">Mis proyectos</h1>
      {projects.length === 0 ? (
        <div className="card text-sm text-muted">
          Todavía no eres miembro de ningún proyecto.
          {actor.isAdmin && (
            <>
              {" "}
              Como administrador puedes crear clientes y proyectos y asignarte en{" "}
              <Link href="/admin" className="link">
                Administración
              </Link>
              .
            </>
          )}
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <li key={p.projectId}>
              <Link href={`/p/${p.projectId}`} className="card block hover:border-accent">
                <div className="text-xs text-muted">{p.clientName}</div>
                <div className="mt-1 font-semibold">{p.projectName}</div>
                <div className="mt-3 flex gap-2">
                  <span className="badge">{ROLE_LABELS[p.role]}</span>
                  {p.projectStatus === "archived" && <span className="badge">Archivado</span>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
