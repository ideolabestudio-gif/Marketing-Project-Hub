import { describe, expect, it } from "vitest";
import { aggregateColumn, CsvError, guessNumberFormat, parseCsv, parseNumber } from "@/modules/metrics/csv";

describe("parseCsv", () => {
  it("detecta punto y coma, quita el BOM y respeta comillas", () => {
    const csv = parseCsv('﻿Fecha;Alcance;"Texto; con ; separadores"\n2026-11-01;1.200;"a ""b"""\r\n2026-11-02;800;x\n');
    expect(csv.delimiter).toBe(";");
    expect(csv.headers).toEqual(["Fecha", "Alcance", "Texto; con ; separadores"]);
    expect(csv.rows).toEqual([
      ["2026-11-01", "1.200", 'a "b"'],
      ["2026-11-02", "800", "x"],
    ]);
  });

  it("detecta comas y tabuladores e ignora filas vacías", () => {
    expect(parseCsv("a,b\n1,2\n\n").rows).toEqual([["1", "2"]]);
    expect(parseCsv("a\tb\n1\t2").delimiter).toBe("\t");
  });

  it("rechaza archivos vacíos, sin datos o con comillas sin cerrar", () => {
    expect(() => parseCsv("")).toThrow(CsvError);
    expect(() => parseCsv("solo,cabeceras")).toThrow(CsvError);
    expect(() => parseCsv('a,b\n"1,2')).toThrow(CsvError);
  });
});

describe("parseNumber", () => {
  it.each([
    ["1.234,5", "es", 1234.5],
    ["1.000", "es", 1000],
    ["12,5", "es", 12.5],
    ["45%", "es", 45],
    ["1,234.5", "en", 1234.5],
    ["1.000", "en", 1],
    ["3.5", "en", 3.5],
    [" 7 ", "en", 7],
    ["-3", "es", -3],
  ] as const)("%s (%s) → %s", (raw, format, expected) => {
    expect(parseNumber(raw, format)).toBe(expected);
  });

  it("vacío es null; texto o formato equivocado es NaN", () => {
    expect(parseNumber("", "es")).toBeNull();
    expect(parseNumber("-", "en")).toBeNull();
    expect(parseNumber("n/a", "es")).toBeNaN();
    expect(parseNumber("1,234.5", "es")).toBeNaN();
  });

  it("propone el formato según las celdas", () => {
    expect(guessNumberFormat(parseCsv("a;b\n1.200;2,5\n"))).toBe("es");
    expect(guessNumberFormat(parseCsv("a;b\n1,200;3.25\n"))).toBe("en");
    expect(guessNumberFormat(parseCsv("a,b\n12,30\n"))).toBe("es");
  });
});

describe("aggregateColumn", () => {
  const csv = parseCsv("Día;Seguidores;Impresiones;Tasa\n1;100;1.000;2,5\n2;;500;3,5\n3;110;1.500;\n");
  it("suma, primera/última fila, media y máximo ignorando celdas vacías", () => {
    expect(aggregateColumn(csv, 2, "sum", "es")).toEqual({ value: 3000, usedRows: 3 });
    expect(aggregateColumn(csv, 1, "last", "es")).toEqual({ value: 110, usedRows: 1 });
    expect(aggregateColumn(csv, 1, "first", "es")).toEqual({ value: 100, usedRows: 1 });
    expect(aggregateColumn(csv, 3, "average", "es")).toEqual({ value: 3, usedRows: 2 });
    expect(aggregateColumn(csv, 2, "max", "es")).toEqual({ value: 1500, usedRows: 3 });
  });

  it("indica la fila exacta si una celda no es un número", () => {
    const bad = parseCsv("a;b\n1;2\n2;hola\n");
    expect(() => aggregateColumn(bad, 1, "sum", "es")).toThrow(/Fila 3.*hola/);
  });
});
