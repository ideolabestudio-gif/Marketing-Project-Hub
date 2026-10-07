import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { projectContextForPage } from "@/lib/project-page";
import { PLATFORMS, PLATFORM_KEYS } from "@/modules/projects/catalog";
import { getAiStatus } from "@/modules/ai/service";
import { getProject, listChannels } from "@/modules/projects/service";
import { createChannelAction, setChannelActiveAction, updateAiSettingsAction, updateSettingsAction } from "./actions";

export default async function ProjectSettingsPage({ params }: PageProps<"/p/[projectId]/ajustes">) {
  const { projectId } = await params;
  const ctx = await projectContextForPage(projectId, "project.settings");
  const [project, channels, ai] = await Promise.all([getProject(ctx), listChannels(ctx), getAiStatus(ctx)]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={`/p/${projectId}`} className="link text-sm">
          ← {project.name}
        </Link>
        <h1 className="h1 mt-1">Ajustes del proyecto</h1>
      </div>

      <section className="card flex flex-col gap-3">
        <h2 className="h2">General</h2>
        <ActionForm action={updateSettingsAction.bind(null, projectId)} submitLabel="Guardar" className="grid gap-3">
          <label className="field">
            Zona horaria
            <input name="timezone" defaultValue={project.timezone} className="input" required />
          </label>
          <label className="field">
            Idioma
            <input name="locale" defaultValue={project.locale} className="input" required />
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="requireClientApproval" defaultChecked={project.requireClientApproval} />
            <span>
              Exigir la aprobación del cliente antes de publicar
              <span className="block text-muted">
                Si se desactiva, basta con la aprobación interna. Se registra siempre con evidencia.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="separationOfDuties" defaultChecked={project.separationOfDuties} />
            <span>
              Separación de funciones
              <span className="block text-muted">Quien escribe una versión no puede aprobarla internamente.</span>
            </span>
          </label>
        </ActionForm>
      </section>

      <section className="card flex flex-col gap-3">
        <h2 className="h2">Borradores con IA</h2>
        <p className="text-sm text-muted">
          Si se activa, el equipo puede pedir borradores de textos, ideas para el mes y una primera lectura de las
          métricas para el informe. La IA solo recibe datos de este proyecto, se envían al proveedor ({ai.model}) para
          generar el texto, y todo lo que produce queda marcado y necesita revisión humana. No publica ni envía nada.
        </p>
        {!ai.configured && (
          <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
            El servidor no tiene configurado un proveedor de IA (variables AI_PROVIDER y ANTHROPIC_API_KEY). Puedes
            dejarlo activado, pero no se podrá generar nada hasta configurarlo.
          </p>
        )}
        <p className="text-sm">
          Gasto este mes:{" "}
          <strong>
            {ai.spentUsd.toLocaleString("es-ES", { style: "currency", currency: "USD" })} de{" "}
            {ai.limitUsd.toLocaleString("es-ES", { style: "currency", currency: "USD" })}
          </strong>
        </p>
        <ActionForm action={updateAiSettingsAction.bind(null, projectId)} submitLabel="Guardar" className="grid gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="aiEnabled" defaultChecked={ai.enabled} />
            Activar la IA en este proyecto
          </label>
          <label className="field max-w-xs">
            Límite de gasto al mes (USD)
            <input
              name="aiMonthlyLimitUsd"
              className="input"
              inputMode="decimal"
              defaultValue={String(ai.limitUsd).replace(".", ",")}
              required
            />
          </label>
        </ActionForm>
      </section>

      <section className="card flex flex-col gap-3">
        <h2 className="h2">Canales</h2>
        <p className="text-sm text-muted">
          Todos los canales funcionan en modo manual. Las integraciones (Metricool, MailerLite) se
          activarán solo tras verificar sus capacidades.
        </p>
        <table className="table">
          <thead>
            <tr>
              <th>Canal</th>
              <th>Plataforma</th>
              <th>Cuenta / lista</th>
              <th>Estado</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {channels.map((c) => (
              <tr key={c.id}>
                <td>{c.displayName}</td>
                <td>{PLATFORMS[c.platform as keyof typeof PLATFORMS]?.label ?? c.platform}</td>
                <td>{c.handle ?? "—"}</td>
                <td>{c.isActive ? "Activo" : "Inactivo"}</td>
                <td>
                  <ActionForm
                    action={setChannelActiveAction.bind(null, projectId, c.id, !c.isActive)}
                    submitLabel={c.isActive ? "Desactivar" : "Activar"}
                    variant="secondary"
                  >
                    {null}
                  </ActionForm>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <h3 className="mt-2 font-medium">Añadir canal</h3>
        <ActionForm action={createChannelAction.bind(null, projectId)} submitLabel="Añadir">
          <label className="field">
            Plataforma
            <select name="platform" className="input" required>
              {PLATFORM_KEYS.map((k) => (
                <option key={k} value={k}>
                  {PLATFORMS[k].label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Nombre
            <input name="displayName" className="input" placeholder="Instagram principal" required />
          </label>
          <label className="field">
            Cuenta o lista
            <input name="handle" className="input" placeholder="@cuenta o nombre de la lista" />
          </label>
        </ActionForm>
      </section>
    </div>
  );
}
