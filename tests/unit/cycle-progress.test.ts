import { describe, expect, it } from "vitest";
import { cycleProgress, nextStep } from "@/modules/cycles/progress";

const base = { briefFilled: true, statuses: [], hasMetrics: false, report: "none", closed: false } as const;

describe("recorrido del mes", () => {
  it("sin brief, lo primero es rellenarlo", () => {
    const steps = cycleProgress({ ...base, briefFilled: false });
    expect(nextStep(steps)?.action.href).toBe("/brief");
    expect(steps.find((s) => s.key === "produce")?.detail).toBe("Sin piezas");
  });

  it("cuenta las piezas por estado sin contar las canceladas", () => {
    const steps = cycleProgress({
      ...base,
      statuses: ["draft", "approved", "scheduled", "published", "cancelled"],
    });
    const by = Object.fromEntries(steps.map((s) => [s.key, s]));
    expect(by.plan.done).toBe(true);
    expect(by.produce).toMatchObject({ done: true, detail: "4 de 4 con texto" });
    expect(by.review).toMatchObject({ done: false, detail: "3 de 4 aprobadas" });
    expect(by.publish.detail).toBe("2 de 4 programadas o publicadas");
    expect(nextStep(steps)?.key).toBe("review");
  });

  it("una idea sin texto deja pendiente la producción", () => {
    const steps = cycleProgress({ ...base, statuses: ["idea", "approved"] });
    expect(nextStep(steps)?.key).toBe("produce");
  });

  it("con todo publicado, sigue medir, el informe y cerrar", () => {
    const published = { ...base, statuses: ["published", "scheduled"] } as const;
    expect(nextStep(cycleProgress(published))?.key).toBe("measure");
    expect(nextStep(cycleProgress({ ...published, hasMetrics: true }))?.action.label).toBe("Crea el informe");
    expect(nextStep(cycleProgress({ ...published, hasMetrics: true, report: "draft" }))?.action.label).toBe(
      "Termina y aprueba el informe",
    );
    const approved = { ...published, hasMetrics: true, report: "approved" } as const;
    expect(nextStep(cycleProgress(approved))?.key).toBe("close");
    expect(nextStep(cycleProgress({ ...approved, closed: true }))).toBeNull();
  });
});
