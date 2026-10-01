import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Registro de auditoría append-only (un trigger impide UPDATE y DELETE).
 * `project_id` no tiene FK a propósito: se registran también intentos de acceso a
 * proyectos inexistentes. Está en la lista blanca de la prueba DB-06.
 */
export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id"),
    actorId: uuid("actor_id"),
    action: text("action").notNull(),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    data: jsonb("data").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_events_project_idx").on(t.projectId, t.createdAt)],
);
