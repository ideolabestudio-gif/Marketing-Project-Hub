import { globSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * WF-08: ningún código de la aplicación hace llamadas de red salientes ni programa
 * tareas automáticas. Publicar o enviar lo hace siempre una persona fuera del Hub.
 * Cuando exista una integración verificada (docs/07), se añadirá aquí su carpeta con
 * su informe de verificación como justificación.
 */
const ALLOWED: Record<string, string> = {};

const FORBIDDEN = [
  { pattern: /\bfetch\s*\(/, what: "fetch()" },
  { pattern: /from\s+["']node:https?["']|require\(["'](node:)?https?["']\)/, what: "módulo http/https" },
  { pattern: /\baxios\b/, what: "axios" },
  { pattern: /XMLHttpRequest/, what: "XMLHttpRequest" },
  { pattern: /\bsetInterval\s*\(/, what: "setInterval (tareas periódicas)" },
  { pattern: /node-cron|pg-boss|bullmq/, what: "planificador de tareas" },
];

describe("WF-08: sin llamadas externas ni tareas automáticas", () => {
  it("el código de src/ no contiene llamadas de red ni planificadores", () => {
    const problems: string[] = [];
    for (const file of globSync("src/**/*.{ts,tsx}")) {
      if (Object.keys(ALLOWED).some((dir) => file.startsWith(dir))) continue;
      const code = readFileSync(file, "utf8");
      for (const { pattern, what } of FORBIDDEN) {
        if (pattern.test(code)) problems.push(`${file}: ${what}`);
      }
    }
    expect(problems).toEqual([]);
  });
});
