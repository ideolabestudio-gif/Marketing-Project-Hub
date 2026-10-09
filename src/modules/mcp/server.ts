import { z } from "zod";
import { DomainError, NotFoundError } from "@/lib/errors";
import type { Actor } from "@/modules/identity/actor";
import { TOOLS, type ToolResult } from "./tools";

/**
 * Servidor MCP (Model Context Protocol) del Hub, transporte «Streamable HTTP» sin
 * sesión: cada POST lleva un mensaje JSON-RPC y recibe la respuesta en JSON. La
 * autenticación (token OAuth) la resuelve la ruta /api/mcp antes de llegar aquí.
 */

const SUPPORTED_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];

const INSTRUCTIONS = `Marketing Project Hub de Ideolab: calendario mensual de redes sociales y email marketing de varios clientes.
- Empieza con listar_proyectos para obtener el proyecto_id.
- Este conector solo lee y deja borradores. Nada se aprueba, publica ni envía desde aquí: lo que guardes lo revisa una persona en el Hub (dale siempre el enlace).
- No inventes métricas: si un dato no está, di «sin dato».
- No mezcles datos de clientes distintos en una misma respuesta.`;

type JsonRpcId = string | number | null;
export type JsonRpcResponse =
  | { jsonrpc: "2.0"; id: JsonRpcId; result: unknown }
  | { jsonrpc: "2.0"; id: JsonRpcId; error: { code: number; message: string } };

const messageSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number()]).optional(),
  method: z.string(),
  params: z.record(z.string(), z.unknown()).optional(),
});

function error(id: JsonRpcId, code: number, message: string): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

export function listTools() {
  return TOOLS.map((t) => ({
    name: t.name,
    title: t.title,
    description: t.description,
    inputSchema: z.toJSONSchema(t.input, { io: "input" }),
    annotations: { title: t.title, readOnlyHint: t.readOnly, destructiveHint: false, openWorldHint: false },
  }));
}

/** Ejecuta una herramienta. Los errores de dominio vuelven como resultado con isError. */
export async function callTool(actor: Actor, name: string, args: unknown): Promise<ToolResult | null> {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return null;
  const parsed = tool.input.safeParse(args ?? {});
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { text: `Datos no válidos: ${issue.path.join(".") || "entrada"}: ${issue.message}`, isError: true };
  }
  try {
    return await (tool.run as (a: Actor, i: unknown) => Promise<ToolResult>)(actor, parsed.data);
  } catch (err) {
    if (err instanceof NotFoundError) {
      return { text: `${err.message === "No encontrado" ? "No encontrado o sin acceso" : err.message}.`, isError: true };
    }
    if (err instanceof DomainError) return { text: err.message, isError: true };
    throw err;
  }
}

/**
 * Procesa un mensaje JSON-RPC. Devuelve null para las notificaciones (sin id), que
 * no llevan respuesta.
 */
export async function handleMessage(actor: Actor, body: unknown): Promise<JsonRpcResponse | null> {
  const parsed = messageSchema.safeParse(body);
  if (!parsed.success) return error(null, -32600, "Petición JSON-RPC no válida");
  const { id, method, params } = parsed.data;
  if (id === undefined) return null;

  switch (method) {
    case "initialize": {
      const requested = typeof params?.protocolVersion === "string" ? params.protocolVersion : "";
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: SUPPORTED_VERSIONS.includes(requested) ? requested : SUPPORTED_VERSIONS[1],
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "marketing-project-hub", title: "Marketing Project Hub", version: "1.0.0" },
          instructions: INSTRUCTIONS,
        },
      };
    }
    case "ping":
      return { jsonrpc: "2.0", id, result: {} };
    case "tools/list":
      return { jsonrpc: "2.0", id, result: { tools: listTools() } };
    case "tools/call": {
      const name = typeof params?.name === "string" ? params.name : "";
      const result = await callTool(actor, name, params?.arguments);
      if (!result) return error(id, -32602, `Herramienta desconocida: ${name}`);
      return {
        jsonrpc: "2.0",
        id,
        result: { content: [{ type: "text", text: result.text }], isError: result.isError ?? false },
      };
    }
    default:
      return error(id, -32601, `Método no admitido: ${method}`);
  }
}
