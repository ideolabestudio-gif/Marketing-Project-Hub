import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  type PgTableExtraConfigValue,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { contentItems } from "./content";
import { cycles } from "./cycles";
import { users } from "./identity";
import { projects } from "./projects";

/**
 * - copy_draft: borrador de copy (o de email) para una pieza.
 * - ideas: ideas de contenido para el mes.
 * - report_interpretation: lectura de las métricas registradas para el informe.
 * - calendar_plan: propuesta de calendario del mes (piezas con fecha, canal y formato).
 */
export const aiPurpose = pgEnum("ai_purpose", ["copy_draft", "ideas", "report_interpretation", "calendar_plan"]);
/** draft → used | discarded (una sola vez). failed: el proveedor no devolvió texto. */
export const aiGenerationStatus = pgEnum("ai_generation_status", ["draft", "used", "discarded", "failed"]);

/**
 * Lo que generó la IA, tal cual, separado de los datos originales. Nunca modifica
 * contenidos ni informes: una persona decide usarlo (y entonces se crea una fila nueva
 * que apunta aquí). Inmutable salvo el estado (trigger).
 */
export const aiGenerations = pgTable(
  "ai_generations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    cycleId: uuid("cycle_id").notNull(),
    contentItemId: uuid("content_item_id"),
    purpose: aiPurpose("purpose").notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    promptTemplate: text("prompt_template").notNull(),
    promptTemplateVersion: integer("prompt_template_version").notNull(),
    /** Qué pidió la persona (opcional). */
    instructions: text("instructions"),
    /** IDs de las filas usadas como contexto; todas del mismo proyecto. */
    inputRefs: jsonb("input_refs").$type<Record<string, string[]>>().notNull(),
    output: text("output").notNull().default(""),
    error: text("error"),
    status: aiGenerationStatus("status").notNull().default("draft"),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    costUsd: numeric("cost_usd", { precision: 10, scale: 6, mode: "number" }).notNull().default(0),
    requestedBy: uuid("requested_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedBy: uuid("resolved_by").references(() => users.id),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  // Tipo explícito: content_items y ai_generations se referencian mutuamente.
  (t): PgTableExtraConfigValue[] => [
    unique("ai_generations_project_id_id_uq").on(t.projectId, t.id),
    // Permite exigir en BD que una versión use un borrador de su misma pieza.
    unique("ai_generations_project_item_id_uq").on(t.projectId, t.contentItemId, t.id),
    foreignKey({ name: "ai_generations_cycle_fk", columns: [t.projectId, t.cycleId], foreignColumns: [cycles.projectId, cycles.id] }),
    foreignKey({
      name: "ai_generations_item_fk",
      columns: [t.projectId, t.contentItemId],
      foreignColumns: [contentItems.projectId, contentItems.id],
    }),
    check("ai_generations_item_ck", sql`(${t.purpose} = 'copy_draft') = (${t.contentItemId} IS NOT NULL)`),
    index("ai_generations_project_created_idx").on(t.projectId, t.createdAt),
  ],
);
