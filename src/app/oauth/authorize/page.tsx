import { redirect } from "next/navigation";
import { getCurrentActor } from "@/modules/identity/next";
import { checkAuthorizationRequest } from "@/modules/oauth/service";
import { approveAction, denyAction } from "./actions";

/** Pantalla de permiso del conector de Claude: la persona decide si Claude puede usar su cuenta. */
export default async function AuthorizePage({ searchParams }: PageProps<"/oauth/authorize">) {
  const raw = await searchParams;
  const params = Object.fromEntries(
    Object.entries(raw).filter((e): e is [string, string] => typeof e[1] === "string"),
  );
  const actor = await getCurrentActor();
  if (!actor) {
    const back = `/oauth/authorize?${new URLSearchParams(params).toString()}`;
    redirect(`/login?next=${encodeURIComponent(back)}`);
  }

  const check = await checkAuthorizationRequest(params);
  if (!check.ok && "redirectTo" in check) redirect(check.redirectTo);

  return (
    <main className="mx-auto mt-24 max-w-md">
      <div className="card flex flex-col gap-4">
        <h1 className="h1">Conectar con Claude</h1>
        {!check.ok ? (
          <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
            {check.message}
          </p>
        ) : (
          <>
            <p className="text-sm">
              <strong>{check.clientName}</strong> quiere usar el Hub con tu cuenta (<strong>{actor.email}</strong>).
            </p>
            <div className="text-sm">
              <p>Podrá, solo en los proyectos de los que eres miembro y con tus permisos:</p>
              <ul className="mt-1 list-disc pl-5">
                <li>Ver proyectos, ciclos, piezas, métricas e informes.</li>
                <li>Dejar borradores de calendario y de texto para que los revises.</li>
                <li>Subir un CSV de métricas que tú confirmas en el Hub.</li>
              </ul>
              <p className="mt-2">No podrá aprobar, publicar, enviar ni borrar nada.</p>
            </div>
            <p className="text-sm text-muted">
              Pulsa «Permitir» solo si acabas de añadir tú el conector en Claude. Puedes desconectarlo cuando quieras
              en «Conexiones».
            </p>
            <div className="flex gap-2">
              <form action={approveAction}>
                <input type="hidden" name="params" value={JSON.stringify(check.params)} />
                <button type="submit" className="btn btn-primary">
                  Permitir
                </button>
              </form>
              <form action={denyAction}>
                <input type="hidden" name="params" value={JSON.stringify(check.params)} />
                <button type="submit" className="btn btn-secondary">
                  Cancelar
                </button>
              </form>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
