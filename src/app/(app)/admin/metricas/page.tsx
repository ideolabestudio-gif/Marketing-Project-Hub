import { ActionForm } from "@/components/action-form";
import { UNIT_LABELS, type MetricUnit } from "@/lib/format";
import { requireAdminActor } from "@/modules/identity/next";
import { adminListMetricDefinitions, type MetricDefinition } from "@/modules/metrics/service";
import { createMetricDefinitionAction, updateMetricDefinitionAction } from "../actions";

const AGGREGATION_OPTIONS = {
  sum: "Suma de las filas",
  last: "Última fila",
  average: "Media",
  max: "Máximo",
} as const;

function DefinitionFields({ def }: { def?: MetricDefinition }) {
  return (
    <>
      <label className="field">
        Nombre
        <input name="label" className="input" defaultValue={def?.label ?? ""} required />
      </label>
      <label className="field">
        Qué mide (definición)
        <textarea name="description" className="input min-h-16" defaultValue={def?.description ?? ""} required />
      </label>
      <label className="field">
        Dónde se obtiene (opcional)
        <input name="sourceNote" className="input" defaultValue={def?.sourceNote ?? ""} />
      </label>
      <div className="flex flex-wrap gap-3">
        <label className="field">
          Resumen propuesto al importar CSV
          <select name="defaultAggregation" className="input" defaultValue={def?.defaultAggregation ?? "sum"}>
            {Object.entries(AGGREGATION_OPTIONS).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Orden
          <input name="position" type="number" min={0} className="input w-24" defaultValue={def?.position ?? 100} />
        </label>
      </div>
    </>
  );
}

export default async function MetricCatalogPage() {
  const actor = await requireAdminActor();
  const definitions = await adminListMetricDefinitions(actor);
  const groups = [
    { kind: "social", title: "Redes sociales" },
    { kind: "email", title: "Email marketing" },
  ] as const;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="h1">Catálogo de métricas</h1>
      <p className="text-sm text-muted">
        Métricas que se pueden registrar en todos los proyectos. La clave y la unidad no cambian una vez creadas (los
        datos registrados dependen de ellas); una métrica desactivada deja de ofrecerse pero conserva sus datos.
      </p>

      {groups.map((g) => (
        <section key={g.kind} className="card flex flex-col gap-3">
          <h2 className="h2">{g.title}</h2>
          <ul className="flex flex-col gap-2">
            {definitions
              .filter((d) => d.kind === g.kind)
              .map((d) => (
                <li key={d.key}>
                  <details className="rounded-md border border-border p-3">
                    <summary className="cursor-pointer">
                      <span className={d.isActive ? "font-medium" : "font-medium text-muted line-through"}>{d.label}</span>{" "}
                      <span className="text-xs text-muted">
                        {d.key} · {UNIT_LABELS[d.unit as MetricUnit]}
                        {!d.isActive && " · desactivada"}
                      </span>
                      <div className="text-sm text-muted">{d.description}</div>
                    </summary>
                    <ActionForm
                      action={updateMetricDefinitionAction.bind(null, d.key)}
                      submitLabel="Guardar"
                      className="mt-3 grid gap-3"
                    >
                      <DefinitionFields def={d} />
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" name="isActive" defaultChecked={d.isActive} />
                        Activa
                      </label>
                    </ActionForm>
                  </details>
                </li>
              ))}
          </ul>
        </section>
      ))}

      <section className="card flex flex-col gap-3">
        <h2 className="h2">Nueva métrica</h2>
        <ActionForm action={createMetricDefinitionAction} submitLabel="Crear métrica" className="grid gap-3">
          <div className="flex flex-wrap gap-3">
            <label className="field">
              Clave
              <input name="key" className="input" placeholder="social.saves" required pattern="(social|email)\.[a-z0-9_]{2,40}" />
            </label>
            <label className="field">
              Unidad
              <select name="unit" className="input" defaultValue="count">
                {Object.entries(UNIT_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <DefinitionFields />
        </ActionForm>
      </section>
    </div>
  );
}
