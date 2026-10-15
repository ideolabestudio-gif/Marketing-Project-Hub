import { describe, expect, it } from "vitest";
import { buildMetricoolHandoff, type MetricoolHandoffInput } from "@/modules/content/metricool-handoff";

const base: MetricoolHandoffInput = {
  brand: "Cerveza Byra",
  channelName: "Instagram",
  format: "carousel",
  plannedAt: new Date("2026-11-05T09:00:00Z"),
  timeZone: "Europe/Madrid",
  versionNo: 3,
  body: "¡Llega la nueva IPA!\n#byra",
  linkUrl: "https://byra.example/ipa",
  assets: [
    { kind: "file", filename: "ipa-1.jpg", url: null },
    { kind: "link", filename: "Diseño en Canva", url: "https://canva.example/d/1" },
  ],
};

describe("buildMetricoolHandoff", () => {
  it("incluye marca, red, formato, fecha en la zona del proyecto, texto literal y material", () => {
    const text = buildMetricoolHandoff(base);
    expect(text).toContain("«Cerveza Byra»");
    expect(text).toContain("red Instagram, formato Carrusel");
    expect(text).toContain("5 de noviembre de 2026");
    expect(text).toContain("10:00");
    expect(text).toContain("<<<\n¡Llega la nueva IPA!\n#byra\n>>>");
    expect(text).toContain("versión 3");
    expect(text).toContain("Enlace de destino: https://byra.example/ipa");
    expect(text).toContain("- Diseño en Canva: https://canva.example/d/1");
    expect(text).toContain("- ipa-1.jpg");
  });

  it("pide dejarla pendiente de revisión, nunca publicarla", () => {
    const text = buildMetricoolHandoff(base);
    expect(text).toContain("pendiente de revisión");
    expect(text).toContain("no la publiques ni la programes directamente");
  });

  it("sin fecha prevista pide a Claude que pregunte", () => {
    const text = buildMetricoolHandoff({ ...base, plannedAt: null, linkUrl: null, assets: [] });
    expect(text).toContain("pregúntame la fecha");
    expect(text).not.toContain("Enlace de destino");
    expect(text).not.toContain("Archivos");
  });
});
