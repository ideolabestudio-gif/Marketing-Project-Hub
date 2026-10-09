import { z } from "zod";
import { NotFoundError } from "@/lib/errors";
import { utcToWallTime } from "@/lib/time";
import { requireProjectAccess } from "@/modules/access/context";
import type { Permission } from "@/modules/access/permissions";
import { listMyProjects } from "@/modules/access/service";
import {
  getCalendarPlanChatPrompt,
  getCopyDraftChatPrompt,
  importCalendarPlan,
  importCopyDraft,
  prepareNextMonthCalendar,
} from "@/modules/ai/service";
import { BRAND_FIELDS, getBrandProfile } from "@/modules/brand/service";
import { formatLabel } from "@/modules/content/formats";
import { getItemDetail, LIBRARY_CATEGORIES, listItems, listLibrary } from "@/modules/content/service";
import { CYCLE_STATUS_LABELS, getCycle, getCycleByPeriod, listCycles } from "@/modules/cycles/service";
import type { Actor } from "@/modules/identity/actor";
import { getMetricSummary, uploadMetricCsv } from "@/modules/metrics/service";
import { oauthUrls } from "@/modules/oauth/config";
import { getProject, listChannels } from "@/modules/projects/service";
import { WORKFLOW_LABELS } from "@/modules/review/domain";
import { listCycleStatuses } from "@/modules/review/service";

/**
 * Herramientas del conector de Claude. Cada una entra por requireProjectAccess con la
 * persona del token, igual que una página del Hub: sin membresía, «no encontrado».
 * Solo leen o dejan borradores en ai_generations / importaciones pendientes; ninguna
 * aprueba, publica, envía ni borra. Lo que deja Claude lo revisa una persona en el Hub.
 */

export type ToolResult = { text: string; isError?: boolean };

type Tool<S extends z.ZodObject> = {
  name: string;
  title: string;
  description: string;
  input: S;
  readOnly: boolean;
  run: (actor: Actor, input: z.infer<S>) => Promise<ToolResult>;
};

function tool<S extends z.ZodObject>(t: Tool<S>): Tool<S> {
  return t;
}

const projectId = z.string().describe("ID del proyecto (de listar_proyectos)");
const period = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Formato AAAA-MM")
  .describe("Mes del ciclo en formato AAAA-MM, p. ej. 2026-11");
const instructions = z
  .string()
  .max(2000)
  .optional()
  .describe("Indicaciones de la persona (tono, fechas, temas…), si las dio");

function json(value: unknown): ToolResult {
  return { text: JSON.stringify(value, null, 2) };
}

function hubUrl(path: string): string {
  return `${oauthUrls().issuer}${path}`;
}

async function context(actor: Actor, id: string, permission: Permission = "project.read") {
  return requireProjectAccess(actor, id, permission);
}

async function cycleOf(actor: Actor, id: string, p: string, permission?: Permission) {
  const ctx = await context(actor, id, permission);
  try {
    return { ctx, cycle: await getCycleByPeriod(ctx, p) };
  } catch (err) {
    if (err instanceof NotFoundError) throw new NotFoundError(`No hay ciclo abierto para ${p} en este proyecto`);
    throw err;
  }
}

export const TOOLS = [
  tool({
    name: "listar_proyectos",
    title: "Listar proyectos",
    description: "Proyectos del Hub en los que la persona conectada es miembro, con su cliente y su rol.",
    input: z.object({}),
    readOnly: true,
    run: async (actor) => {
      const rows = await listMyProjects(actor);
      return json(
        rows.map((r) => ({
          proyecto_id: r.projectId,
          proyecto: r.projectName,
          cliente: r.clientName,
          rol: r.role,
          archivado: r.projectStatus === "archived",
        })),
      );
    },
  }),

  tool({
    name: "ver_proyecto",
    title: "Ver proyecto",
    description:
      "Datos de un proyecto: ficha del cliente (tono de voz, público, qué evitar…), materiales de la biblioteca, " +
      "zona horaria, idioma, canales (con su ID) y ciclos mensuales.",
    input: z.object({ proyecto_id: projectId }),
    readOnly: true,
    run: async (actor, input) => {
      const ctx = await context(actor, input.proyecto_id);
      const [project, channels, cycles, brand, library] = await Promise.all([
        getProject(ctx),
        listChannels(ctx),
        listCycles(ctx),
        getBrandProfile(ctx),
        listLibrary(ctx),
      ]);
      const profile = brand.current;
      return json({
        proyecto: project.name,
        cliente: project.clientName,
        zona_horaria: project.timezone,
        idioma: project.locale,
        ficha_cliente: profile
          ? Object.fromEntries(BRAND_FIELDS.filter((f) => profile[f.key]).map((f) => [f.label, profile[f.key]]))
          : null,
        materiales: library.map((m) => ({
          titulo: m.title,
          categoria: LIBRARY_CATEGORIES[m.category],
          descripcion: m.description,
          tipo: m.asset.kind === "link" ? "enlace" : "archivo",
          enlace: m.asset.kind === "link" ? m.asset.url : hubUrl(`/p/${ctx.projectId}/archivos/${m.asset.id}`),
        })),
        canales: channels.map((c) => ({
          canal_id: c.id,
          nombre: c.displayName,
          plataforma: c.platform,
          tipo: c.kind === "email" ? "email" : "red social",
          activo: c.isActive,
        })),
        ciclos: cycles.map((c) => ({ periodo: c.period, estado: CYCLE_STATUS_LABELS[c.status] })),
        enlace: hubUrl(`/p/${ctx.projectId}`),
      });
    },
  }),

  tool({
    name: "ver_ciclo",
    title: "Ver ciclo del mes",
    description: "Brief del mes y calendario de piezas de un ciclo, con el estado de cada pieza.",
    input: z.object({ proyecto_id: projectId, periodo: period }),
    readOnly: true,
    run: async (actor, input) => {
      const { ctx, cycle } = await cycleOf(actor, input.proyecto_id, input.periodo);
      const [project, items, statuses] = await Promise.all([
        getProject(ctx),
        listItems(ctx, cycle.id),
        listCycleStatuses(ctx, cycle.id),
      ]);
      return json({
        ciclo_id: cycle.id,
        periodo: cycle.period,
        estado: CYCLE_STATUS_LABELS[cycle.status],
        objetivos: cycle.objectives,
        fechas_clave: cycle.keyDates,
        notas: cycle.notes,
        piezas: items.map((i) => ({
          pieza_id: i.id,
          titulo: i.title,
          canal: i.channelName,
          formato: formatLabel(i.format),
          fecha: i.plannedAt ? utcToWallTime(i.plannedAt, project.timezone) : null,
          estado: statuses[i.id] ? WORKFLOW_LABELS[statuses[i.id]] : null,
          version: i.latestVersion,
        })),
        enlace: hubUrl(`/p/${ctx.projectId}/ciclos/${cycle.period}`),
      });
    },
  }),

  tool({
    name: "ver_pieza",
    title: "Ver pieza",
    description: "Una pieza del calendario con el texto de su versión vigente, su historial y sus comentarios.",
    input: z.object({ proyecto_id: projectId, pieza_id: z.string().describe("ID de la pieza (de ver_ciclo)") }),
    readOnly: true,
    run: async (actor, input) => {
      const ctx = await context(actor, input.proyecto_id);
      const { item, current, versions, comments } = await getItemDetail(ctx, input.pieza_id);
      const [project, statuses] = await Promise.all([getProject(ctx), listCycleStatuses(ctx, item.cycleId)]);
      return json({
        pieza_id: item.id,
        titulo: item.title,
        canal: item.channelName,
        formato: formatLabel(item.format),
        fecha: item.plannedAt ? utcToWallTime(item.plannedAt, project.timezone) : null,
        estado: statuses[item.id] ? WORKFLOW_LABELS[statuses[item.id]] : null,
        version_vigente: current
          ? {
              numero: current.versionNo,
              asunto: current.emailSubject,
              preencabezado: current.emailPreheader,
              texto: current.body,
              enlace: current.linkUrl,
            }
          : null,
        versiones: versions.map((v) => ({ numero: v.versionNo, nota: v.note, origen: v.origin })),
        comentarios: comments.map((c) => ({ autor: c.authorName ?? c.authorEmail, texto: c.body })),
        enlace: hubUrl(`/p/${ctx.projectId}/ciclos/${item.cyclePeriod}/piezas/${item.id}`),
      });
    },
  }),

  tool({
    name: "ver_metricas",
    title: "Ver métricas del mes",
    description:
      "Métricas registradas en el Hub para un mes, por canal, con el mes anterior. Un valor null significa «sin dato»: no lo estimes.",
    input: z.object({ proyecto_id: projectId, periodo: period }),
    readOnly: true,
    run: async (actor, input) => {
      const { ctx, cycle } = await cycleOf(actor, input.proyecto_id, input.periodo);
      const summary = await getMetricSummary(ctx, { cycleId: cycle.id });
      return json(
        summary.map(({ channel, rows }) => ({
          canal: channel.displayName,
          canal_id: channel.id,
          metricas: rows.map((r) => ({
            metrica: r.definition.label,
            valor: r.value,
            mes_anterior: r.previous,
            variacion_pct: r.change === null ? null : Math.round(r.change * 10) / 10,
            fuente: r.source,
          })),
        })),
      );
    },
  }),

  tool({
    name: "preparar_calendario",
    title: "Preparar calendario del mes",
    description:
      "Devuelve las instrucciones y los datos para proponer el calendario de un mes. Sin periodo, prepara el mes que viene (y abre su ciclo si hace falta). Escribe la propuesta siguiendo esas instrucciones y guárdala con guardar_propuesta_calendario.",
    input: z.object({ proyecto_id: projectId, periodo: period.optional(), indicaciones: instructions }),
    readOnly: false,
    run: async (actor, input) => {
      const ctx = await context(actor, input.proyecto_id, "ai.generate");
      const cycle = input.periodo
        ? (await cycleOf(actor, input.proyecto_id, input.periodo)).cycle
        : (await prepareNextMonthCalendar(ctx, { instructions: input.indicaciones, viaChat: true })).cycle;
      const prompt = await getCalendarPlanChatPrompt(ctx, { cycleId: cycle.id, instructions: input.indicaciones });
      return {
        text: [
          `Ciclo ${cycle.period} (ciclo_id: ${cycle.id}).`,
          "Escribe la propuesta con estas instrucciones y guárdala con guardar_propuesta_calendario usando ese ciclo_id. Después enséñale a la persona un resumen y el enlace para revisarla.",
          "",
          prompt,
        ].join("\n"),
      };
    },
  }),

  tool({
    name: "guardar_propuesta_calendario",
    title: "Guardar propuesta de calendario",
    description:
      "Guarda en el Hub una propuesta de calendario (el JSON que piden las instrucciones de preparar_calendario). No crea piezas: una persona elige en el Hub cuáles añadir.",
    input: z.object({
      proyecto_id: projectId,
      ciclo_id: z.string().describe("ciclo_id que devolvió preparar_calendario"),
      propuesta: z
        .union([z.string(), z.record(z.string(), z.unknown())])
        .describe('JSON con la forma {"pieces": [...]} indicada en las instrucciones'),
      indicaciones: instructions,
    }),
    readOnly: false,
    run: async (actor, input) => {
      const ctx = await context(actor, input.proyecto_id, "ai.generate");
      const output = typeof input.propuesta === "string" ? input.propuesta : JSON.stringify(input.propuesta);
      const generation = await importCalendarPlan(ctx, {
        cycleId: input.ciclo_id,
        output,
        instructions: input.indicaciones,
      });
      const cycle = await getCycle(ctx, generation.cycleId);
      return {
        text: `Propuesta guardada como borrador. Revísala y elige las piezas en ${hubUrl(`/p/${ctx.projectId}/ciclos/${cycle.period}#calendario-ia`)}`,
      };
    },
  }),

  tool({
    name: "preparar_texto_pieza",
    title: "Preparar texto de una pieza",
    description:
      "Devuelve las instrucciones y los datos para escribir el texto de una pieza. Escríbelo siguiendo esas instrucciones y guárdalo con guardar_borrador_texto.",
    input: z.object({ proyecto_id: projectId, pieza_id: z.string(), indicaciones: instructions }),
    readOnly: true,
    run: async (actor, input) => {
      const ctx = await context(actor, input.proyecto_id, "ai.generate");
      const prompt = await getCopyDraftChatPrompt(ctx, { itemId: input.pieza_id, instructions: input.indicaciones });
      return {
        text: [
          "Escribe el texto con estas instrucciones y guárdalo con guardar_borrador_texto para la misma pieza.",
          "",
          prompt,
        ].join("\n"),
      };
    },
  }),

  tool({
    name: "guardar_borrador_texto",
    title: "Guardar borrador de texto",
    description:
      "Guarda en el Hub un borrador de texto para una pieza. No crea ninguna versión: una persona lo revisa y decide si lo usa.",
    input: z.object({
      proyecto_id: projectId,
      pieza_id: z.string(),
      texto: z.string().describe("Texto listo para pegar (en email: «Asunto:» y «Preencabezado:» en las dos primeras líneas)"),
      indicaciones: instructions,
    }),
    readOnly: false,
    run: async (actor, input) => {
      const ctx = await context(actor, input.proyecto_id, "ai.generate");
      await importCopyDraft(ctx, { itemId: input.pieza_id, output: input.texto, instructions: input.indicaciones });
      const { item } = await getItemDetail(ctx, input.pieza_id);
      return {
        text: `Borrador guardado. Revísalo en ${hubUrl(`/p/${ctx.projectId}/ciclos/${item.cyclePeriod}/piezas/${item.id}`)}`,
      };
    },
  }),

  tool({
    name: "subir_csv_metricas",
    title: "Subir CSV de métricas",
    description:
      "Sube al Hub un CSV de métricas de un canal y un mes. Queda pendiente: una persona asigna las columnas y confirma la importación en el Hub. Usa solo cifras reales que te haya dado la persona o un informe; nunca las inventes.",
    input: z.object({
      proyecto_id: projectId,
      periodo: period,
      canal_id: z.string().describe("ID del canal (de ver_proyecto)"),
      csv: z.string().describe("Contenido del CSV, con una fila de cabeceras"),
      nombre_archivo: z.string().max(150).optional(),
    }),
    readOnly: false,
    run: async (actor, input) => {
      const { ctx, cycle } = await cycleOf(actor, input.proyecto_id, input.periodo, "metrics.write");
      const imp = await uploadMetricCsv(ctx, {
        cycleId: cycle.id,
        channelId: input.canal_id,
        filename: input.nombre_archivo || `metricas-${cycle.period}.csv`,
        text: input.csv,
      });
      return {
        text: `CSV subido (${imp.rowCount} filas). Falta confirmarlo: asigna las columnas y aplica la importación en ${hubUrl(`/p/${ctx.projectId}/ciclos/${cycle.period}/metricas/importar/${imp.id}`)}`,
      };
    },
  }),
];
