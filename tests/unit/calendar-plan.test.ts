import { describe, expect, it } from "vitest";
import { calendarPlanJsonSchema, parseCalendarPlan } from "@/modules/ai/calendar-plan";

const channels = [
  { id: "ig", displayName: "Instagram", kind: "social" as const, isActive: true },
  { id: "nl", displayName: "Newsletter", kind: "email" as const, isActive: true },
  { id: "old", displayName: "Twitter", kind: "social" as const, isActive: false },
];
const options = { channelIds: ["ig", "nl", "old"], channels, period: "2026-11", timezone: "Europe/Madrid" };
const piece = (over: Record<string, string>) => ({
  channel: "C1",
  format: "post",
  date: "2026-11-03T10:00",
  title: "Título",
  idea: "Idea",
  ...over,
});

describe("propuesta de calendario de la IA", () => {
  it("el esquema solo admite las referencias de los canales enviados", () => {
    expect(JSON.stringify(calendarPlanJsonSchema(2))).toContain('"enum":["C1","C2"]');
  });

  it("descarta canal desconocido o desactivado, formato ajeno al canal y fechas no válidas o fuera del mes", () => {
    const output = JSON.stringify({
      pieces: [
        piece({ channel: "C2", format: "newsletter", date: "2026-11-05T09:00" }),
        piece({}),
        piece({ channel: "C3" }), // desactivado
        piece({ channel: "C9" }),
        piece({ channel: "C2", format: "reel" }),
        piece({ date: "2026-12-01T10:00" }),
        piece({ date: "2026-11-31T10:00" }),
        piece({ title: "  " }),
        { channel: "C1" },
      ],
    });
    const { proposals, discarded } = parseCalendarPlan(output, options);
    expect(proposals.map((p) => [p.index, p.channelName, p.format, p.plannedAt])).toEqual([
      [1, "Instagram", "post", "2026-11-03T10:00"],
      [0, "Newsletter", "newsletter", "2026-11-05T09:00"],
    ]);
    expect(discarded).toBe(7);
  });

  it("una respuesta que no es la esperada no da propuestas", () => {
    expect(parseCalendarPlan("no es JSON", options)).toEqual({ proposals: [], discarded: 0 });
    expect(parseCalendarPlan('{"otra":1}', options)).toEqual({ proposals: [], discarded: 0 });
  });
});
