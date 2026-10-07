import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { contentItems } from "./content";
import { cycles } from "./cycles";
import { users } from "./identity";
import { channelKind, channels, projects } from "./projects";

export const metricUnit = pgEnum("metric_unit", ["count", "percent", "currency", "seconds"]);
export const metricAggregation = pgEnum("metric_aggregation", ["sum", "last", "average", "max"]);
export const metricSource = pgEnum("metric_source", ["manual", "csv_import", "integration"]);
export const metricImportStatus = pgEnum("metric_import_status", ["pending", "applied", "discarded"]);

/**
 * Catálogo global de métricas (no es dato de cliente). Lo gestiona un administrador.
 * Las definiciones son orientativas: cada plataforma define sus métricas a su manera.
 */
export const metricDefinitions = pgTable("metric_definitions", {
  key: text("key").primaryKey(),
  kind: channelKind("kind").notNull(),
  label: text("label").notNull(),
  unit: metricUnit("unit").notNull(),
  description: text("description").notNull(),
  sourceNote: text("source_note"),
  /** Agregación que se propone al importar un CSV con varias filas (p. ej. una por día). */
  defaultAggregation: metricAggregation("default_aggregation").notNull().default("sum"),
  position: integer("position").notNull().default(100),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** CSV subido tal cual (dato original) y su estado. El contenido no se puede modificar. */
export const metricImports = pgTable(
  "metric_imports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    cycleId: uuid("cycle_id").notNull(),
    channelId: uuid("channel_id").notNull(),
    filename: text("filename").notNull(),
    rawCsv: text("raw_csv").notNull(),
    rowCount: integer("row_count").notNull(),
    status: metricImportStatus("status").notNull().default("pending"),
    uploadedBy: uuid("uploaded_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedBy: uuid("resolved_by").references(() => users.id),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [
    unique("metric_imports_project_id_id_uq").on(t.projectId, t.id),
    foreignKey({ name: "metric_imports_cycle_fk", columns: [t.projectId, t.cycleId], foreignColumns: [cycles.projectId, cycles.id] }),
    foreignKey({
      name: "metric_imports_channel_fk",
      columns: [t.projectId, t.channelId],
      foreignColumns: [channels.projectId, channels.id],
    }),
  ],
);

/**
 * Valor de una métrica en un ciclo y canal (dato original, con su fuente). Inmutable:
 * una corrección es una fila nueva que apunta (supersedes_id) a la que sustituye.
 */
export const metricValues = pgTable(
  "metric_values",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    cycleId: uuid("cycle_id").notNull(),
    channelId: uuid("channel_id").notNull(),
    contentItemId: uuid("content_item_id"),
    metricKey: text("metric_key")
      .notNull()
      .references(() => metricDefinitions.key),
    value: numeric("value", { precision: 20, scale: 4, mode: "number" }).notNull(),
    source: metricSource("source").notNull(),
    importId: uuid("import_id"),
    sourceDetail: text("source_detail"),
    note: text("note"),
    supersedesId: uuid("supersedes_id"),
    capturedBy: uuid("captured_by")
      .notNull()
      .references(() => users.id),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("metric_values_project_id_id_uq").on(t.projectId, t.id),
    foreignKey({ name: "metric_values_cycle_fk", columns: [t.projectId, t.cycleId], foreignColumns: [cycles.projectId, cycles.id] }),
    foreignKey({
      name: "metric_values_channel_fk",
      columns: [t.projectId, t.channelId],
      foreignColumns: [channels.projectId, channels.id],
    }),
    foreignKey({
      name: "metric_values_item_fk",
      columns: [t.projectId, t.contentItemId],
      foreignColumns: [contentItems.projectId, contentItems.id],
    }),
    foreignKey({
      name: "metric_values_import_fk",
      columns: [t.projectId, t.importId],
      foreignColumns: [metricImports.projectId, metricImports.id],
    }),
    foreignKey({
      name: "metric_values_supersedes_fk",
      columns: [t.projectId, t.supersedesId],
      foreignColumns: [t.projectId, t.id],
    }),
    check("metric_values_import_ck", sql`(${t.source} = 'csv_import') = (${t.importId} IS NOT NULL)`),
    // Una fila solo puede ser corregida una vez (las correcciones forman una cadena).
    uniqueIndex("metric_values_supersedes_uq").on(t.supersedesId).where(sql`${t.supersedesId} IS NOT NULL`),
    index("metric_values_cycle_idx").on(t.projectId, t.cycleId),
  ],
);
