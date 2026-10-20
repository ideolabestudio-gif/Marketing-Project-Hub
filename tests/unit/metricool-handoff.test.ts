import { describe, expect, it } from "vitest";
import {
  buildMetricoolBulkHandoff,
  buildMetricoolHandoff,
  type MetricoolBulkPost,
  type MetricoolHandoffInput,
} from "@/modules/content/metricool-handoff";

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

describe("buildMetricoolBulkHandoff", () => {
  const { brand: _brand, timeZone: _tz, ...post } = base;
  const posts: MetricoolBulkPost[] = [
    { ...post, title: "Lanzamiento IPA" },
    { ...post, title: "Sorteo", channelName: "Facebook", format: "post", plannedAt: null, linkUrl: null, assets: [], body: "¡Sorteo!" },
  ];

  it("reúne todas las publicaciones con un único encabezado de instrucciones", () => {
    const text = buildMetricoolBulkHandoff({ brand: "Cerveza Byra", timeZone: "Europe/Madrid", posts });
    expect(text.match(/Usa el conector de Metricool/g)).toHaveLength(1);
    expect(text).toContain("Crea estas 2 publicaciones en la marca «Cerveza Byra»");
    expect(text).toContain("Publicación 1 de 2: Lanzamiento IPA");
    expect(text).toContain("Red Instagram, formato Carrusel, para el");
    expect(text).toContain("10:00");
    expect(text).toContain("<<<\n¡Llega la nueva IPA!\n#byra\n>>>");
    expect(text).toContain("- Diseño en Canva: https://canva.example/d/1");
    expect(text).toContain("Publicación 2 de 2: Sorteo");
    expect(text).toContain("Red Facebook");
    expect(text).toContain("<<<\n¡Sorteo!\n>>>");
  });

  it("pide dejarlas pendientes de revisión y preguntar las que no tienen fecha", () => {
    const text = buildMetricoolBulkHandoff({ brand: "Cerveza Byra", timeZone: "Europe/Madrid", posts });
    expect(text).toContain("pendientes de revisión");
    expect(text).toContain("no publiques ni programes ninguna directamente");
    expect(text).toContain("pregúntame la fecha");
  });
});
