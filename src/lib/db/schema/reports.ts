import {
  boolean,
  foreignKey,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { cycles } from "./cycles";
import { users } from "./identity";
import { channels, projects } from "./projects";

export const reportStatus = pgEnum("report_status", ["draft", "approved"]);
/**
 * - data: tabla de métricas registradas (nunca valores inventados).
 * - publications: lo publicado en el mes según el Hub.
 * - human_analysis: texto escrito por el equipo.
 * (F5 añadirá ai_interpretation, separada y marcada.)
 */
export const reportSectionKind = pgEnum("report_section_kind", ["data", "publications", "human_analysis"]);

/** Informe mensual de un ciclo (uno por ciclo). */
export const reports = pgTable(
  "reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    cycleId: uuid("cycle_id").notNull(),
    status: reportStatus("status").notNull().default("draft"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    approvedBy: uuid("approved_by").references(() => users.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
  },
  (t) => [
    unique("reports_project_id_id_uq").on(t.projectId, t.id),
    unique("reports_project_cycle_uq").on(t.projectId, t.cycleId),
    foreignKey({ name: "reports_cycle_fk", columns: [t.projectId, t.cycleId], foreignColumns: [cycles.projectId, cycles.id] }),
  ],
);

export const reportSections = pgTable(
  "report_sections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    reportId: uuid("report_id").notNull(),
    position: integer("position").notNull(),
    kind: reportSectionKind("kind").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    /** Solo secciones de datos: canal a mostrar (null = todos los canales). */
    channelId: uuid("channel_id"),
    comparePrevious: boolean("compare_previous").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("report_sections_project_id_id_uq").on(t.projectId, t.id),
    foreignKey({
      name: "report_sections_report_fk",
      columns: [t.projectId, t.reportId],
      foreignColumns: [reports.projectId, reports.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "report_sections_channel_fk",
      columns: [t.projectId, t.channelId],
      foreignColumns: [channels.projectId, channels.id],
    }),
  ],
);
