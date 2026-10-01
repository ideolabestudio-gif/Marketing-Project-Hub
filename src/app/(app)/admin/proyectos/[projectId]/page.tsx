import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { NotFoundError } from "@/lib/errors";
import { ROLE_LABELS, ROLES } from "@/modules/access/permissions";
import { adminListProjectMembers } from "@/modules/access/service";
import { requireAdminActor } from "@/modules/identity/next";
import { adminListUsers } from "@/modules/identity/service";
import { adminGetProject } from "@/modules/projects/service";
import { removeMembershipAction, setMembershipAction, setProjectStatusAction } from "../../actions";

export default async function AdminProjectPage({ params }: PageProps<"/admin/proyectos/[projectId]">) {
  const { projectId } = await params;
  const actor = await requireAdminActor();
  let data;
  try {
    data = await Promise.all([
      adminGetProject(actor, projectId),
      adminListProjectMembers(actor, projectId),
      adminListUsers(actor),
    ]);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }
  const [project, members, users] = data;
  const memberIds = new Set(members.map((m) => m.userId));
  const candidates = users.filter((u) => u.isActive && !memberIds.has(u.id));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="text-sm text-muted">{project.clientName}</div>
        <h1 className="h1">{project.name}</h1>
      </div>

      <section className="card flex flex-col gap-3">
        <h2 className="h2">Miembros</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Persona</th>
              <th>Rol</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.userId}>
                <td>{m.email}</td>
                <td>
                  <ActionForm action={setMembershipAction.bind(null, projectId)} submitLabel="Cambiar" variant="secondary">
                    <input type="hidden" name="userId" value={m.userId} />
                    <select name="role" defaultValue={m.role} className="input">
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </option>
                      ))}
                    </select>
                  </ActionForm>
                </td>
                <td>
                  <ActionForm
                    action={removeMembershipAction.bind(null, projectId, m.userId)}
                    submitLabel="Retirar"
                    variant="danger"
                  >
                    {null}
                  </ActionForm>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <h3 className="mt-2 font-medium">Añadir miembro</h3>
        {candidates.length === 0 ? (
          <p className="text-sm text-muted">No hay más usuarios activos. Da de alta usuarios en Usuarios.</p>
        ) : (
          <ActionForm action={setMembershipAction.bind(null, projectId)} submitLabel="Añadir">
            <label className="field">
              Usuario
              <select name="userId" className="input" required>
                {candidates.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.email}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Rol
              <select name="role" className="input" defaultValue="editor">
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            </label>
          </ActionForm>
        )}
      </section>

      <section className="card flex flex-col gap-3">
        <h2 className="h2">Estado</h2>
        <p className="text-sm text-muted">
          Un proyecto archivado queda en solo lectura para todos sus miembros.
        </p>
        <ActionForm
          action={setProjectStatusAction.bind(null, projectId, project.status === "active" ? "archived" : "active")}
          submitLabel={project.status === "active" ? "Archivar proyecto" : "Reactivar proyecto"}
          variant={project.status === "active" ? "danger" : "secondary"}
        >
          {null}
        </ActionForm>
      </section>
    </div>
  );
}
