import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { requireAdminActor } from "@/modules/identity/next";
import { adminListClients, adminListProjects } from "@/modules/projects/service";
import { createClientAction, createProjectAction } from "./actions";

export default async function AdminPage() {
  const actor = await requireAdminActor();
  const [clients, projects] = await Promise.all([adminListClients(actor), adminListProjects(actor)]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="h1">Clientes y proyectos</h1>
      <p className="text-sm text-muted">
        La administración gestiona la estructura y los accesos. Para ver el trabajo de un proyecto hay
        que ser miembro de él.
      </p>

      <section className="card flex flex-col gap-3">
        <h2 className="h2">Proyectos</h2>
        {projects.length === 0 ? (
          <p className="text-sm text-muted">Aún no hay proyectos.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Proyecto</th>
                <th>Zona horaria</th>
                <th>Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.id}>
                  <td>{p.clientName}</td>
                  <td>{p.name}</td>
                  <td>{p.timezone}</td>
                  <td>{p.status === "active" ? "Activo" : "Archivado"}</td>
                  <td>
                    <Link href={`/admin/proyectos/${p.id}`} className="link">
                      Miembros
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <h3 className="mt-2 font-medium">Nuevo proyecto</h3>
        {clients.length === 0 ? (
          <p className="text-sm text-muted">Crea primero un cliente.</p>
        ) : (
          <ActionForm action={createProjectAction} submitLabel="Crear proyecto">
            <label className="field">
              Cliente
              <select name="clientId" className="input" required>
                {clients
                  .filter((c) => c.status === "active")
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="field">
              Nombre
              <input name="name" className="input" required />
            </label>
            <label className="field">
              Identificador
              <input name="slug" className="input" placeholder="marca-principal" required />
            </label>
            <label className="field">
              Zona horaria
              <input name="timezone" className="input" defaultValue="Europe/Madrid" />
            </label>
          </ActionForm>
        )}
      </section>

      <section className="card flex flex-col gap-3">
        <h2 className="h2">Clientes</h2>
        <ul className="text-sm">
          {clients.map((c) => (
            <li key={c.id}>
              {c.name} {c.status === "archived" && <span className="badge">Archivado</span>}
            </li>
          ))}
        </ul>
        <ActionForm action={createClientAction} submitLabel="Crear cliente">
          <label className="field">
            Nombre del cliente
            <input name="name" className="input" required />
          </label>
        </ActionForm>
      </section>
    </div>
  );
}
