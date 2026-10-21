import { describe, expect, it } from "vitest";
import { buildMetricsRequest } from "@/modules/metrics/claude-request";

describe("petición de métricas para Claude", () => {
  const text = buildMetricsRequest({
    brand: "Cerveza Byra",
    projectId: "11111111-1111-4111-8111-111111111111",
    period: "2026-02",
    monthLabel: "Febrero de 2026",
    channels: [
      { id: "c1", displayName: "IG Byra", platform: "instagram", handle: "@byra" },
      { id: "c2", displayName: "Facebook Byra", platform: "facebook", handle: null },
    ],
    metricLabels: ["Seguidores", "Alcance"],
  });

  it("pide las columnas con los nombres del catálogo, una fila por día del mes", () => {
    expect(text).toContain("febrero de 2026 (del 1 al 28)");
    expect(text).toContain("Fecha, Seguidores, Alcance");
    expect(text).toContain("una fila por día");
  });

  it("lista cada red con su canal_id y da el proyecto y el periodo para subir el CSV", () => {
    expect(text).toContain("- IG Byra (Instagram @byra) · canal_id: c1");
    expect(text).toContain("- Facebook Byra (Facebook) · canal_id: c2");
    expect(text).toContain("proyecto_id: 11111111-1111-4111-8111-111111111111, periodo: 2026-02");
  });

  it("prohíbe estimar cifras y no pide aplicar nada", () => {
    expect(text).toContain("no la estimes ni la calcules");
    expect(text).toContain("las aplico yo en el Hub");
  });
});
