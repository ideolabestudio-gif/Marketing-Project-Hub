import Link from "next/link";
import { ROLE_LABELS } from "@/modules/access/permissions";
import { listMyProjects } from "@/modules/access/service";
import { requireActor } from "@/modules/identity/next";

export default async function HomePage() {
  const actor = await requireActor();
  const projects = await listMyProjects(actor);

  return (
    <div className="flex flex-col gap-6">
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
