import { describe, expect, it } from "vitest";
import { splitEmailDraft } from "@/modules/ai/format";
import { findUnverifiedNumbers } from "@/modules/ai/numbers";

describe("findUnverifiedNumbers", () => {
  const data = "- Seguidores: 4820 · 4790 · +0,6 %\n- Alcance: 6540\n- Impresiones: 12.345,5\nMes: noviembre de 2026";

  it("acepta cifras presentes en los datos, en cualquier formato habitual", () => {
    expect(findUnverifiedNumbers("Llegamos a 4820 seguidores (+0,6 %) y 6.540 de alcance.", data)).toEqual([]);
    expect(findUnverifiedNumbers("Impresiones: 12.345,5, o unas 12.346 redondeando.", data)).toEqual([]);
    expect(findUnverifiedNumbers("En noviembre de 2026…", data)).toEqual([]);
  });

  it("señala cifras que no estaban", () => {
    expect(findUnverifiedNumbers("El alcance subió un 15 % hasta 7.000.", data)).toEqual(["15", "7.000"]);
  });
});

describe("splitEmailDraft", () => {
  it("separa asunto y preencabezado del cuerpo", () => {
    expect(splitEmailDraft("Asunto: Llega el otoño\nPreencabezado: Nueva cerveza\n\nHola,\nTexto")).toEqual({
      subject: "Llega el otoño",
      preheader: "Nueva cerveza",
      body: "Hola,\nTexto",
    });
  });

  it("si no vienen, deja todo en el cuerpo", () => {
    expect(splitEmailDraft("Hola,\nTexto")).toEqual({ subject: "", preheader: "", body: "Hola,\nTexto" });
  });
});
