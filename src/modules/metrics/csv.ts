/**
 * Lectura de CSV genérica, sin dependencias: detecta el separador (, ; o tabulador),
 * respeta comillas y saltos de línea dentro de comillas, y quita el BOM.
 * Pensada para exportaciones de Metricool, MailerLite u hojas de cálculo.
 */

export const CSV_LIMITS = { maxBytes: 1024 * 1024, maxRows: 5000, maxColumns: 100 } as const;

export type ParsedCsv = { headers: string[]; rows: string[][]; delimiter: string };

export class CsvError extends Error {}

function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  let best = ",";
  let bestCount = -1;
  for (const d of [",", ";", "\t"]) {
    let count = 0;
    let inQuotes = false;
    for (const ch of firstLine) {
      if (ch === '"') inQuotes = !inQuotes;
      else if (ch === d && !inQuotes) count++;
    }
    if (count > bestCount) {
      best = d;
      bestCount = count;
    }
  }
  return best;
}

export function parseCsv(input: string): ParsedCsv {
  const text = input.replace(/^﻿/, "");
  if (!text.trim()) throw new CsvError("El archivo está vacío");
  const delimiter = detectDelimiter(text);
  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
      continue;
    }
    if (ch === '"' && field === "") inQuotes = true;
    else if (ch === delimiter) {
      record.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      record.push(field);
      records.push(record);
      record = [];
      field = "";
    } else field += ch;
  }
  if (inQuotes) throw new CsvError("Hay unas comillas sin cerrar");
  if (field !== "" || record.length > 0) {
    record.push(field);
    records.push(record);
  }

  const nonEmpty = records.filter((r) => r.some((c) => c.trim() !== ""));
  if (nonEmpty.length < 2) throw new CsvError("El archivo necesita una fila de cabeceras y al menos una fila de datos");
  const headers = nonEmpty[0].map((h, i) => h.trim() || `Columna ${i + 1}`);
  if (headers.length > CSV_LIMITS.maxColumns) throw new CsvError(`Demasiadas columnas (máximo ${CSV_LIMITS.maxColumns})`);
  const rows = nonEmpty.slice(1);
  if (rows.length > CSV_LIMITS.maxRows) throw new CsvError(`Demasiadas filas (máximo ${CSV_LIMITS.maxRows})`);
  return { headers, rows: rows.map((r) => headers.map((_, i) => (r[i] ?? "").trim())), delimiter };
}

export const NUMBER_FORMATS = ["es", "en"] as const;
export type NumberFormat = (typeof NUMBER_FORMATS)[number];

export const NUMBER_FORMAT_LABELS: Record<NumberFormat, string> = {
  es: "1.234,56 (punto para miles, coma para decimales)",
  en: "1,234.56 (coma para miles, punto para decimales)",
};

/**
 * Convierte un número en el formato indicado. Devuelve null si la celda está vacía y
 * NaN si no es un número. Acepta un "%" final. No adivina: "1.000" es mil en formato
 * español y uno en formato inglés; por eso el formato lo confirma la persona.
 */
export function parseNumber(raw: string, format: NumberFormat): number | null {
  let s = raw.trim().replace(/\s/g, "").replace(/%$/, "");
  if (s === "" || s === "-") return null;
  // Miles en grupos de 3 (opcionales) y como mucho un separador decimal.
  const valid =
    format === "es"
      ? /^[+-]?(\d{1,3}(\.\d{3})+|\d+)(,\d+)?$/
      : /^[+-]?(\d{1,3}(,\d{3})+|\d+)(\.\d+)?$/;
  if (!valid.test(s)) return Number.NaN;
  const [thousands, decimal] = format === "es" ? [".", ","] : [",", "."];
  s = s.split(thousands).join("");
  if (decimal === ",") s = s.replace(",", ".");
  return Number(s);
}

/** Propone el formato mirando las celdas: una coma con 1-2 decimales sugiere formato español. */
export function guessNumberFormat(csv: ParsedCsv): NumberFormat {
  let es = 0;
  let en = 0;
  for (const row of csv.rows) {
    for (const cell of row) {
      if (/^\d{1,3}(\.\d{3})+(,\d+)?%?$|^\d+,\d{1,2}%?$/.test(cell)) es++;
      else if (/^\d{1,3}(,\d{3})+(\.\d+)?%?$|^\d+\.\d{1,2}%?$/.test(cell)) en++;
    }
  }
  return en > es ? "en" : "es";
}

export const AGGREGATIONS = ["sum", "last", "first", "average", "max"] as const;
export type Aggregation = (typeof AGGREGATIONS)[number];

export const AGGREGATION_LABELS: Record<Aggregation, string> = {
  sum: "Suma de las filas",
  last: "Valor de la última fila",
  first: "Valor de la primera fila",
  average: "Media de las filas",
  max: "Máximo",
};

/** Agrega una columna. Lanza CsvError indicando la fila si una celda no es un número. */
export function aggregateColumn(
  csv: ParsedCsv,
  columnIndex: number,
  aggregation: Aggregation,
  format: NumberFormat,
): { value: number; usedRows: number } {
  const values: number[] = [];
  csv.rows.forEach((row, i) => {
    const n = parseNumber(row[columnIndex] ?? "", format);
    if (n === null) return;
    if (Number.isNaN(n)) {
      throw new CsvError(`Fila ${i + 2}, columna «${csv.headers[columnIndex]}»: «${row[columnIndex]}» no es un número`);
    }
    values.push(n);
  });
  if (values.length === 0) throw new CsvError(`La columna «${csv.headers[columnIndex]}» no tiene números`);
  const round = (n: number) => Math.round(n * 10000) / 10000;
  switch (aggregation) {
    case "sum":
      return { value: round(values.reduce((a, b) => a + b, 0)), usedRows: values.length };
    case "last":
      return { value: values[values.length - 1], usedRows: 1 };
    case "first":
      return { value: values[0], usedRows: 1 };
    case "average":
      return { value: round(values.reduce((a, b) => a + b, 0) / values.length), usedRows: values.length };
    case "max":
      return { value: Math.max(...values), usedRows: values.length };
  }
}
