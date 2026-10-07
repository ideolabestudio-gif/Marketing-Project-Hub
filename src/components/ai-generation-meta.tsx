import { formatInZone } from "@/lib/time";

const STATUS = { draft: "Pendiente de revisar", used: "Usado", discarded: "Descartado", failed: "Falló" } as const;

/** Cabecera común de todo lo generado con IA: siempre marcado como tal. */
export function AiGenerationMeta({
  generation,
  tz,
}: {
  generation: {
    status: keyof typeof STATUS;
    model: string;
    createdAt: Date;
    requestedByName: string | null;
    instructions: string | null;
    costUsd: number;
  };
  tz: string;
}) {
  return (
    <div className="flex flex-col gap-1 text-xs text-muted">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded bg-violet-100 px-2 py-0.5 font-medium text-violet-900">Generado con IA</span>
        <span className="badge">{STATUS[generation.status]}</span>
        <span>
          {generation.requestedByName} · {formatInZone(generation.createdAt, tz)} · {generation.model} ·{" "}
          {generation.costUsd.toLocaleString("es-ES", { style: "currency", currency: "USD", maximumFractionDigits: 3 })}
        </span>
      </div>
      {generation.instructions && <div>Indicaciones: {generation.instructions}</div>}
    </div>
  );
}
