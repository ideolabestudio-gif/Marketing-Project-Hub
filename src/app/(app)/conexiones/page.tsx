import { formatInZone } from "@/lib/time";
import { requireActor } from "@/modules/identity/next";
import { oauthUrls } from "@/modules/oauth/config";
import { listMyConnections } from "@/modules/oauth/service";
import { revokeConnectionAction } from "./actions";

const TZ = "Europe/Madrid";

/** Conexiones de Claude con la cuenta de la persona, para verlas y desconectarlas. */
export default async function ConnectionsPage() {
  const actor = await requireActor();
  const connections = await listMyConnections(actor);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="h1">Conexiones con Claude</h1>
      <section className="card flex flex-col gap-2 text-sm">
        <h2 className="h2">Cómo conectar</h2>
        <p>
          En claude.ai, abre Ajustes › Conectores › Añadir conector personalizado y pega esta dirección:
        </p>
        <code className="rounded-md bg-background p-2">{oauthUrls().resource}</code>
        <p className="text-muted">
          Claude solo verá los proyectos de los que eres miembro y solo podrá dejar borradores: nada se aprueba,
          publica ni envía desde Claude.
        </p>
      </section>
      <section className="card flex flex-col gap-3">
        <h2 className="h2">Conexiones activas</h2>
        {connections.length === 0 ? (
          <p className="text-sm text-muted">No hay ninguna conexión activa.</p>
        ) : (
          <ul className="flex flex-col gap-3 text-sm">
            {connections.map((c) => (
              <li key={c.id} className="flex items-center gap-4">
                <span className="grow">
                  <strong>{c.clientName}</strong> · conectado el {formatInZone(c.createdAt, TZ)}
                  {c.lastUsedAt ? ` · último uso el ${formatInZone(c.lastUsedAt, TZ)}` : ""}
                </span>
                <form action={revokeConnectionAction.bind(null, c.id)}>
                  <button type="submit" className="btn btn-secondary">
                    Desconectar
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
