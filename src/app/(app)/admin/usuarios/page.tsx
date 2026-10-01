import { ActionForm } from "@/components/action-form";
import { requireAdminActor } from "@/modules/identity/next";
import { adminListUsers } from "@/modules/identity/service";
import { inviteUserAction, setUserActiveAction } from "../actions";

export default async function UsersPage() {
  const actor = await requireAdminActor();
  const users = await adminListUsers(actor);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="h1">Usuarios</h1>
      <section className="card flex flex-col gap-3">
        <p className="text-sm text-muted">
          Solo pueden entrar los emails dados de alta aquí. Desactivar un usuario cierra sus sesiones al
          momento.
        </p>
        <table className="table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Nombre</th>
              <th>Admin</th>
              <th>Estado</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.email}</td>
                <td>{u.name ?? "—"}</td>
                <td>{u.isAdmin ? "Sí" : "No"}</td>
                <td>{!u.isActive ? "Desactivado" : u.hasLoggedIn ? "Activo" : "Pendiente de primer acceso"}</td>
                <td>
                  {u.id !== actor.userId && (
                    <ActionForm
                      action={setUserActiveAction.bind(null, u.id, !u.isActive)}
                      submitLabel={u.isActive ? "Desactivar" : "Activar"}
                      variant={u.isActive ? "danger" : "secondary"}
                    >
                      {null}
                    </ActionForm>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <h2 className="h2 mt-2">Dar de alta</h2>
        <ActionForm action={inviteUserAction} submitLabel="Dar de alta">
          <label className="field">
            Email (cuenta de Google)
            <input name="email" type="email" className="input" required />
          </label>
          <label className="field">
            Nombre
            <input name="name" className="input" />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input name="isAdmin" type="checkbox" /> Administrador
          </label>
        </ActionForm>
      </section>
    </div>
  );
}
