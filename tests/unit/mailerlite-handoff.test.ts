import { describe, expect, it } from "vitest";
import { buildMailerLiteHandoff } from "@/modules/content/mailerlite-handoff";

const base = {
  brand: "Cerveza Byra",
  channelName: "Newsletter Byra",
  handle: "Clientes",
  title: "Newsletter de noviembre",
  plannedAt: new Date("2026-11-05T09:00:00Z"),
  timeZone: "Europe/Madrid",
  versionNo: 2,
  subject: "Llega la IPA",
  preheader: "Solo este mes",
  body: "Hola,\nya está aquí.",
  linkUrl: "https://byra.example/ipa",
};

describe("buildMailerLiteHandoff", () => {
  it("pide un borrador y prohíbe programar, enviar o elegir destinatarios", () => {
    const text = buildMailerLiteHandoff(base);
    expect(text).toContain("como BORRADOR");
    expect(text).toContain("No la programes ni la envíes");
    expect(text).toContain("no elijas destinatarios");
  });

  it("lleva asunto, preencabezado, texto literal de la versión aprobada y la fecha prevista", () => {
    const text = buildMailerLiteHandoff(base);
    expect(text).toContain("Asunto: Llega la IPA");
    expect(text).toContain("Preencabezado: Solo este mes");
    expect(text).toContain("versión 2 aprobada");
    expect(text).toContain("<<<\nHola,\nya está aquí.\n>>>");
    expect(text).toContain("5 de noviembre de 2026");
    expect(text).toContain("Newsletter Byra (Clientes)");
    expect(text).toContain("Enlace principal: https://byra.example/ipa");
  });

  it("sin fecha ni asunto lo dice en vez de inventarlo", () => {
    const text = buildMailerLiteHandoff({ ...base, plannedAt: null, subject: null, preheader: null, linkUrl: null });
    expect(text).toContain("Todavía no tiene fecha");
    expect(text).toContain("(sin asunto: pregúntamelo)");
    expect(text).not.toContain("Enlace principal");
  });
});
