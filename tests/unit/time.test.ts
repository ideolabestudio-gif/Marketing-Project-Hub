import { describe, expect, it } from "vitest";
import { addDays, isValidPeriod, monthGrid, nextPeriod, utcToWallTime, wallTimeToUtc, weekOf, zonedDay } from "@/lib/time";

describe("fechas en la zona del proyecto", () => {
  it("convierte hora de Madrid a UTC en invierno y en verano", () => {
    expect(wallTimeToUtc("2026-01-15T10:00", "Europe/Madrid")?.toISOString()).toBe("2026-01-15T09:00:00.000Z");
    expect(wallTimeToUtc("2026-07-15T10:00", "Europe/Madrid")?.toISOString()).toBe("2026-07-15T08:00:00.000Z");
  });

  it("es reversible, también en Canarias y México", () => {
    for (const tz of ["Europe/Madrid", "Atlantic/Canary", "America/Mexico_City", "UTC"]) {
      for (const wall of ["2026-03-29T12:30", "2026-10-25T09:15", "2026-12-31T23:59"]) {
        const utc = wallTimeToUtc(wall, tz);
        expect(utc, `${tz} ${wall}`).not.toBeNull();
        expect(utcToWallTime(utc!, tz)).toBe(wall);
      }
    }
  });

  it("el día depende de la zona (medianoche)", () => {
    const date = new Date("2026-10-04T22:30:00Z");
    expect(zonedDay(date, "UTC")).toBe("2026-10-04");
    expect(zonedDay(date, "Europe/Madrid")).toBe("2026-10-05");
  });

  it("rechaza fechas imposibles", () => {
    expect(wallTimeToUtc("2026-02-30T10:00", "Europe/Madrid")).toBeNull();
    expect(wallTimeToUtc("2026-02-10T25:00", "Europe/Madrid")).toBeNull();
    expect(wallTimeToUtc("mañana", "Europe/Madrid")).toBeNull();
  });

  it("valida periodos y calcula el siguiente", () => {
    expect(isValidPeriod("2026-10")).toBe(true);
    expect(isValidPeriod("2026-13")).toBe(false);
    expect(isValidPeriod("26-10")).toBe(false);
    expect(nextPeriod(new Date("2026-12-31T23:30:00Z"), "Europe/Madrid")).toBe("2027-02");
    expect(nextPeriod(new Date("2026-12-15T10:00:00Z"), "Europe/Madrid")).toBe("2027-01");
  });

  it("monta el calendario de lunes a domingo", () => {
    const weeks = monthGrid("2026-10"); // 1 de octubre de 2026 es jueves
    expect(weeks[0]).toEqual([null, null, null, "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"]);
    expect(weeks.flat().filter(Boolean)).toHaveLength(31);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
  });
});

describe("formatPeriod", () => {
  it("pone en mayúscula solo la primera letra", async () => {
    const { formatPeriod } = await import("@/lib/time");
    expect(formatPeriod("2026-11")).toBe("Noviembre de 2026");
  });
});

describe("semanas", () => {
  it("van de lunes a domingo, también al cambiar de mes y de año", () => {
    expect(weekOf("2026-10-15")).toEqual({ start: "2026-10-12", end: "2026-10-18" });
    expect(weekOf("2026-10-12")).toEqual({ start: "2026-10-12", end: "2026-10-18" });
    expect(weekOf("2026-10-18")).toEqual({ start: "2026-10-12", end: "2026-10-18" });
    expect(weekOf("2027-01-01")).toEqual({ start: "2026-12-28", end: "2027-01-03" });
    expect(addDays("2026-10-25", 1)).toBe("2026-10-26"); // cambio de hora: no afecta a los días
  });
});
