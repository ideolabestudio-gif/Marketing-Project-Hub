import { globSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * WF-08: ningún código de la aplicación hace llamadas de red salientes ni programa
 * tareas automáticas. Publicar o enviar lo hace siempre una persona fuera del Hub.
 * Cuando exista una integración verificada (docs/07), se añadirá aquí su archivo con
 * su justificación. Cada excepción vale solo para ese archivo y esa regla.
 */
const ALLOWED: { file: string; what: string; reason: string }[] = [
  {
    file: "src/lib/ai/anthropic.ts",
    what: "SDK de Anthropic",
    reason:
      "Proveedor de IA (F5, ADR 015): solo recibe texto ya filtrado por proyecto y devuelve un borrador; no publica ni envía nada",
  },
];

const FORBIDDEN = [
  { pattern: /\bfetch\s*\(/, what: "fetch()" },
  { pattern: /from\s+["']node:https?["']|require\(["'](node:)?https?["']\)/, what: "módulo http/https" },
  { pattern: /\baxios\b/, what: "axios" },
  { pattern: /XMLHttpRequest/, what: "XMLHttpRequest" },
  { pattern: /\bsetInterval\s*\(/, what: "setInterval (tareas periódicas)" },
  { pattern: /node-cron|pg-boss|bullmq/, what: "planificador de tareas" },
  { pattern: /["']@anthropic-ai\/sdk|["']openai["']/, what: "SDK de Anthropic" },
];

describe("WF-08: sin llamadas externas ni tareas automáticas", () => {
  it("el código de src/ no contiene llamadas de red ni planificadores", () => {
    const problems: string[] = [];
    for (const file of globSync("src/**/*.{ts,tsx}")) {
      const code = readFileSync(file, "utf8");
      for (const { pattern, what } of FORBIDDEN) {
        if (ALLOWED.some((a) => a.file === file && a.what === what)) continue;
        if (pattern.test(code)) problems.push(`${file}: ${what}`);
      }
    }
    expect(problems).toEqual([]);
  });
});

describe("excepciones justificadas", () => {
  it("cada excepción existe y sigue usando lo que justifica", () => {
    for (const a of ALLOWED) {
      const rule = FORBIDDEN.find((f) => f.what === a.what);
      expect(rule, a.what).toBeDefined();
      expect(rule!.pattern.test(readFileSync(a.file, "utf8")), a.file).toBe(true);
    }
  });
});
