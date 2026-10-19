import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { projectContextForPage } from "@/lib/project-page";
import { PLATFORMS, PLATFORM_KEYS } from "@/modules/projects/catalog";
import { getAiStatus } from "@/modules/ai/service";
import { getProject, listChannels, METRICOOL_HOME_URL } from "@/modules/projects/service";
import { createChannelAction, setChannelActiveAction, updateAiSettingsAction, updateLinksAction, updateSettingsAction } from "./actions";

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
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="field">
              Zona horaria
              <input name="timezone" defaultValue={project.timezone} className="input" required />
            </label>
            <label className="field">
              Idioma
              <input name="locale" defaultValue={project.locale} className="input" required />
            </label>
          </div>
          <label className="tile flex cursor-pointer items-start gap-3 text-sm">
            <input type="checkbox" name="soloMode" defaultChecked={project.soloMode} />
            <span>
              Trabajo en solitario
              <span className="block text-muted">
                Para cuando no hay equipo ni cliente que revise: apruebas cada pieza en un solo paso. Se sigue
                registrando quién aprobó qué versión y cuándo. Desactiva las dos opciones siguientes.
              </span>
            </span>
          </label>
          <label
            className={`tile flex cursor-pointer items-start gap-3 text-sm ${project.soloMode ? "opacity-60" : ""}`}
          >
            <input
              type="checkbox"
              name="requireClientApproval"
              defaultChecked={project.requireClientApproval}
              disabled={project.soloMode}
            />
            <span>
              Exigir la aprobación del cliente antes de publicar
              <span className="block text-muted">
                Si se desactiva, basta con la aprobación interna. Se registra siempre con evidencia.
              </span>
            </span>
          </label>
          <label
            className={`tile flex cursor-pointer items-start gap-3 text-sm ${project.soloMode ? "opacity-60" : ""}`}
          >
            <input
              type="checkbox"
              name="separationOfDuties"
              defaultChecked={project.separationOfDuties}
              disabled={project.soloMode}
            />
            <span>
              Separación de funciones
              <span className="block text-muted">Quien escribe una versión no puede aprobarla internamente.</span>
            </span>
          </label>
        </ActionForm>
      </section>

      <section className="card flex flex-col gap-3">
        <h2 className="h2">Enlaces del proyecto</h2>
        <p className="text-sm text-muted">
          «Crear diseño» aparece en cada post del calendario y «Abrir Metricool» en la página del proyecto; los dos se
          abren en una pestaña nueva. El Hub no se conecta con
          estas herramientas: solo te lleva a ellas.
        </p>
        <ActionForm action={updateLinksAction.bind(null, projectId)} submitLabel="Guardar" className="grid gap-3">
          <label className="field">
            Claude Design (botón «Crear diseño»)
            <input
              type="url"
              name="designUrl"
              defaultValue={project.designUrl ?? ""}
              className="input"
              placeholder="https://claude.ai/design/…"
            />
            <span className="text-xs text-muted">Si lo dejas vacío, el botón no aparece.</span>
          </label>
          <label className="field">
            Metricool (botón «Abrir Metricool»)
            <input
              type="url"
              name="metricoolUrl"
              defaultValue={project.metricoolUrl ?? ""}
              className="input"
              placeholder={METRICOOL_HOME_URL}
            />
            <span className="text-xs text-muted">
              Pega el enlace de la marca de este cliente. Si lo dejas vacío, se abre {METRICOOL_HOME_URL}.
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
          <p className="notice">
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
          Todos los canales funcionan en modo manual. Las integraciones (Metricool, MailerLite) se activarán solo tras
          verificar sus capacidades.
        </p>
        <div className="overflow-x-auto">
          <table className="table min-w-[560px]">
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
                  <td>
                    <span className="badge">{c.isActive ? "Activo" : "Inactivo"}</span>
                  </td>
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
        </div>
        <ActionForm
          action={createChannelAction.bind(null, projectId)}
          submitLabel="Añadir"
          className="tile flex flex-wrap items-end gap-3"
        >
          <h3 className="eyebrow w-full">Añadir canal</h3>
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
