import { pgEnum, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { users } from "./identity";
import { projects } from "./projects";

export const cycleStatus = pgEnum("cycle_status", [
  "planning",
  "production",
  "review",
  "publishing",
  "reporting",
  "closed",
]);

/** Ciclo mensual de un proyecto. `period` tiene el formato AAAA-MM. */
export const cycles = pgTable(
  "cycles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    period: text("period").notNull(),
    status: cycleStatus("status").notNull().default("planning"),
    objectives: text("objectives"),
    keyDates: text("key_dates"),
    notes: text("notes"),
    learnings: text("learnings"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid("created_by").references(() => users.id),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    closedBy: uuid("closed_by").references(() => users.id),
  },
  (t) => [
    unique("cycles_project_id_id_uq").on(t.projectId, t.id),
    unique("cycles_project_period_uq").on(t.projectId, t.period),
  ],
);
