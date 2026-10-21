import type { WorkflowStatus } from "@/modules/review/domain";

/**
 * Recorrido del mes (planificar → cerrar, doc. 01 §1.3) calculado a partir de lo registrado.
 * No se guarda nada: es una lectura de hechos que ya existen (brief, estado de cada pieza,
 * métricas, informe y cierre), así que no puede desincronizarse.
 */

export type CycleStepKey = "plan" | "produce" | "review" | "publish" | "measure" | "report" | "close";

export type CycleStep = {
  key: CycleStepKey;
  label: string;
  done: boolean;
  /** Situación en pocas palabras («8 de 12 aprobadas»). */
  detail: string;
  /** Qué hacer para completarlo y dónde (ruta relativa al plan del mes: "", "/brief", "?vista=lista", "#…"). */
  action: { label: string; href: string };
};

export type CycleProgressInput = {
  briefFilled: boolean;
  /** Estado de cada pieza del mes (las canceladas no cuentan). */
  statuses: readonly WorkflowStatus[];
  hasMetrics: boolean;
  report: "none" | "draft" | "approved";
  closed: boolean;
};

const WRITTEN: readonly WorkflowStatus[] = [
  "draft",
  "in_review",
  "awaiting_client",
  "changes_requested",
  "approved",
  "scheduled",
  "published",
];
const APPROVED: readonly WorkflowStatus[] = ["approved", "scheduled", "published"];
const OUT: readonly WorkflowStatus[] = ["scheduled", "published"];

export function cycleProgress(input: CycleProgressInput): CycleStep[] {
  const active = input.statuses.filter((s) => s !== "cancelled");
  const total = active.length;
  const count = (set: readonly WorkflowStatus[]) => active.filter((s) => set.includes(s)).length;
  const share = (n: number, what: string) => (total === 0 ? "Sin piezas" : `${n} de ${total} ${what}`);
  const all = (n: number) => total > 0 && n === total;

  const written = count(WRITTEN);
  const approved = count(APPROVED);
  const out = count(OUT);

  return [
    {
      key: "plan",
      label: "Planificar",
      done: input.briefFilled && total > 0,
      detail: [input.briefFilled ? "Brief listo" : "Sin brief", total === 1 ? "1 pieza" : `${total} piezas`].join(" · "),
      action: input.briefFilled
        ? { label: "Añade las piezas del mes", href: "#nueva-pieza" }
        : { label: "Rellena el brief del mes", href: "/brief" },
    },
    {
      key: "produce",
      label: "Producir",
      done: all(written),
      detail: share(written, "con texto"),
      action: { label: "Escribe el texto de las piezas que faltan", href: "?vista=lista" },
    },
    {
      key: "review",
      label: "Aprobar",
      done: all(approved),
      detail: share(approved, "aprobadas"),
      action: { label: "Revisa y aprueba las piezas", href: "?vista=lista" },
    },
    {
      key: "publish",
      label: "Programar",
      done: all(out),
      detail: share(out, "programadas o publicadas"),
      action: { label: "Programa lo aprobado y regístralo", href: "#metricool" },
    },
    {
      key: "measure",
      label: "Medir",
      done: input.hasMetrics,
      detail: input.hasMetrics ? "Con datos" : "Sin datos",
      action: { label: "Trae las métricas del mes", href: "/metricas" },
    },
    {
      key: "report",
      label: "Informe",
      done: input.report === "approved",
      detail: input.report === "approved" ? "Aprobado" : input.report === "draft" ? "Borrador" : "Sin crear",
      action: { label: input.report === "none" ? "Crea el informe" : "Termina y aprueba el informe", href: "/informe" },
    },
    {
      key: "close",
      label: "Cerrar",
      done: input.closed,
      detail: input.closed ? "Cerrado" : "Abierto",
      action: { label: "Cierra el mes con sus aprendizajes", href: "#cerrar" },
    },
  ];
}

/** Primer paso sin completar: el que el plan del mes propone como «siguiente paso». */
export function nextStep(steps: CycleStep[]): CycleStep | null {
  return steps.find((s) => !s.done) ?? null;
}
