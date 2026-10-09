import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/lib/db/client";
import { aiGenerations, contentVersions, metricImports } from "@/lib/db/schema";
import { callTool, handleMessage, listTools } from "@/modules/mcp/server";
import { calendarPlanReply, FIXTURE_PERIOD, MARKER_A, MARKER_B, seedTwoProjects, type Fixture } from "../fixtures/two-projects";

let fx: Fixture;

beforeEach(async () => {
  fx = await seedTwoProjects();
});

async function call(name: string, args: Record<string, unknown>, actor = fx.actors.ana) {
  const result = await callTool(actor, name, args);
  if (!result) throw new Error(`Herramienta desconocida: ${name}`);
  return result;
}

describe("protocolo MCP", () => {
  it("responde a initialize con una versión admitida", async () => {
    const res = await handleMessage(fx.actors.ana, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } },
    });
    expect(res).toMatchObject({ id: 1, result: { protocolVersion: "2025-06-18", capabilities: { tools: {} } } });
  });

  it("las notificaciones no tienen respuesta y los métodos desconocidos dan error", async () => {
    expect(await handleMessage(fx.actors.ana, { jsonrpc: "2.0", method: "notifications/initialized" })).toBeNull();
    expect(await handleMessage(fx.actors.ana, { jsonrpc: "2.0", id: 2, method: "resources/list" })).toMatchObject({
      error: { code: -32601 },
    });
    expect(await handleMessage(fx.actors.ana, { nada: true })).toMatchObject({ error: { code: -32600 } });
  });

  it("tools/call devuelve el resultado como texto", async () => {
    const res = await handleMessage(fx.actors.ana, {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "listar_proyectos", arguments: {} },
    });
    expect(res).toMatchObject({ id: 3, result: { isError: false, content: [{ type: "text" }] } });
  });

  it("no ofrece ninguna herramienta para aprobar, publicar, enviar ni borrar", () => {
    const tools = listTools();
    expect(tools.length).toBeGreaterThan(0);
    for (const t of tools) {
      expect(t.name).not.toMatch(/aprob|public|enviar|program|borrar|eliminar|cerrar/);
      expect(t.inputSchema).toMatchObject({ type: "object" });
    }
  });
});

describe("aislamiento por proyecto en las herramientas", () => {
  it("listar_proyectos solo muestra los proyectos de la persona", async () => {
    const { text } = await call("listar_proyectos", {});
    expect(text).toContain(fx.projectA.id);
    expect(text).not.toContain(fx.projectB.id);
    expect(text).not.toContain(MARKER_B);
  });

  it("las herramientas de lectura con datos de A no muestran nada de B", async () => {
    const reads = [
      await call("ver_proyecto", { proyecto_id: fx.projectA.id }),
      await call("ver_ciclo", { proyecto_id: fx.projectA.id, periodo: FIXTURE_PERIOD }),
      await call("ver_pieza", { proyecto_id: fx.projectA.id, pieza_id: fx.contentA.item.id }),
      await call("ver_metricas", { proyecto_id: fx.projectA.id, periodo: FIXTURE_PERIOD }),
    ];
    for (const r of reads) {
      expect(r.isError).toBeFalsy();
      expect(r.text).not.toContain(MARKER_B);
    }
    expect(reads[1].text).toContain(MARKER_A);
  });

  it("un proyecto ajeno o un ID de B dentro de A dan «no encontrado» sin datos", async () => {
    const attempts = [
      await call("ver_proyecto", { proyecto_id: fx.projectB.id }),
      await call("ver_ciclo", { proyecto_id: fx.projectB.id, periodo: FIXTURE_PERIOD }),
      await call("ver_pieza", { proyecto_id: fx.projectA.id, pieza_id: fx.contentB.item.id }),
      await call("guardar_borrador_texto", { proyecto_id: fx.projectA.id, pieza_id: fx.contentB.item.id, texto: "x" }),
      await call("subir_csv_metricas", {
        proyecto_id: fx.projectA.id,
        periodo: FIXTURE_PERIOD,
        canal_id: fx.channelB.id,
        csv: "Alcance\n10\n",
      }),
    ];
    for (const r of attempts) {
      expect(r.isError).toBe(true);
      expect(r.text).not.toContain(MARKER_B);
    }
  });

  it("respeta los permisos del rol: una persona de consulta no puede dejar borradores", async () => {
    const r = await call(
      "guardar_borrador_texto",
      { proyecto_id: fx.projectA.id, pieza_id: fx.contentA.item.id, texto: "Hola" },
      fx.actors.mix,
    );
    expect(r.isError).toBe(true);
  });

  it("valida la entrada", async () => {
    const r = await call("ver_ciclo", { proyecto_id: fx.projectA.id, periodo: "noviembre" });
    expect(r).toMatchObject({ isError: true, text: expect.stringContaining("periodo") });
  });
});

describe("borradores desde Claude", () => {
  it("guardar_borrador_texto deja un borrador sin crear versiones", async () => {
    const before = await getDb().select().from(contentVersions).where(eq(contentVersions.contentItemId, fx.contentA.item.id));
    const prompt = await call("preparar_texto_pieza", { proyecto_id: fx.projectA.id, pieza_id: fx.contentA.item.id });
    expect(prompt.text).toContain(MARKER_A);
    const r = await call("guardar_borrador_texto", {
      proyecto_id: fx.projectA.id,
      pieza_id: fx.contentA.item.id,
      texto: "Texto propuesto por Claude",
    });
    expect(r.isError).toBeFalsy();
    expect(r.text).toContain(`/piezas/${fx.contentA.item.id}`);
    const drafts = await getDb()
      .select()
      .from(aiGenerations)
      .where(and(eq(aiGenerations.contentItemId, fx.contentA.item.id), eq(aiGenerations.provider, "chat")));
    expect(drafts).toMatchObject([{ status: "draft", purpose: "copy_draft", output: "Texto propuesto por Claude", costUsd: 0 }]);
    const after = await getDb().select().from(contentVersions).where(eq(contentVersions.contentItemId, fx.contentA.item.id));
    expect(after).toHaveLength(before.length);
  });

  it("preparar_calendario y guardar_propuesta_calendario dejan una propuesta para revisar", async () => {
    const prep = await call("preparar_calendario", { proyecto_id: fx.projectA.id, periodo: FIXTURE_PERIOD });
    expect(prep.text).toContain(fx.contentA.cycle.id);
    const r = await call("guardar_propuesta_calendario", {
      proyecto_id: fx.projectA.id,
      ciclo_id: fx.contentA.cycle.id,
      propuesta: JSON.parse(calendarPlanReply("claude")),
    });
    expect(r.isError).toBeFalsy();
    expect(r.text).toContain("#calendario-ia");
    const plans = await getDb()
      .select()
      .from(aiGenerations)
      .where(and(eq(aiGenerations.cycleId, fx.contentA.cycle.id), eq(aiGenerations.provider, "chat")));
    expect(plans.some((p) => p.purpose === "calendar_plan" && p.output.includes("claude"))).toBe(true);
  });

  it("preparar_calendario sin periodo abre el ciclo del mes que viene", async () => {
    const r = await call("preparar_calendario", { proyecto_id: fx.projectA.id });
    expect(r.isError).toBeFalsy();
    expect(r.text).toMatch(/^Ciclo \d{4}-\d{2}/);
  });

  it("subir_csv_metricas deja una importación pendiente de confirmar", async () => {
    const r = await call("subir_csv_metricas", {
      proyecto_id: fx.projectA.id,
      periodo: FIXTURE_PERIOD,
      canal_id: fx.channelA.id,
      csv: "Alcance,Seguidores\n1200,340\n",
    });
    expect(r.isError).toBeFalsy();
    const imports = await getDb()
      .select()
      .from(metricImports)
      .where(and(eq(metricImports.projectId, fx.projectA.id), eq(metricImports.filename, `metricas-${FIXTURE_PERIOD}.csv`)));
    expect(imports).toMatchObject([{ status: "pending" }]);
  });
});
