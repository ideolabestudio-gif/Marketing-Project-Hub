import Link from "next/link";
import { nextStep, type CycleStep } from "@/modules/cycles/progress";

/** Los pasos del mes y el siguiente que toca, calculados a partir de lo registrado. */
export function CycleProgress({ steps, base }: { steps: CycleStep[]; base: string }) {
  const next = nextStep(steps);
  const href = (h: string) => (h.startsWith("#") ? h : `${base}${h}`);
  return (
    <section className="card flex flex-col gap-4" aria-labelledby="progreso-mes">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="progreso-mes" className="h2">
          Cómo va el mes
        </h2>
        {next ? (
          <Link href={href(next.action.href)} className="btn btn-primary">
            Siguiente paso: {next.action.label} <span aria-hidden="true">→</span>
          </Link>
        ) : (
          <span className="badge">Mes completo</span>
        )}
      </div>
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {steps.map((s, i) => {
          const current = s === next;
          return (
            <li
              key={s.key}
              aria-current={current ? "step" : undefined}
              className={`flex items-start gap-2 rounded-lg border p-2.5 text-sm ${
                current ? "border-accent ring-2 ring-(--ring)" : "border-border"
              } ${s.done ? "bg-surface-muted" : "bg-surface"}`}
            >
              <span
                aria-hidden="true"
                className={`grid size-5 shrink-0 place-items-center rounded-full text-xs font-semibold ${
                  s.done ? "bg-accent text-on-accent" : "border border-border-strong text-muted"
                }`}
              >
                {s.done ? "✓" : i + 1}
              </span>
              <span className="min-w-0">
                <span className="block font-medium">
                  {s.label}
                  <span className="sr-only">{s.done ? " (hecho)" : current ? " (siguiente paso)" : " (pendiente)"}</span>
                </span>
                <span className="block text-xs text-muted">{s.detail}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
