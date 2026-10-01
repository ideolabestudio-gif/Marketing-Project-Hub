import {
  boolean,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./identity";

export const recordStatus = pgEnum("record_status", ["active", "archived"]);
export const channelKind = pgEnum("channel_kind", ["social", "email"]);
export const channelMode = pgEnum("channel_mode", ["manual", "integration"]);
export const projectRole = pgEnum("project_role", ["manager", "editor", "reviewer", "viewer"]);

export const clients = pgTable("clients", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  status: recordStatus("status").notNull().default("active"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Un proyecto es la frontera de aislamiento: todo dato de cliente cuelga de un proyecto. */
export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    timezone: text("timezone").notNull().default("Europe/Madrid"),
    locale: text("locale").notNull().default("es-ES"),
    status: recordStatus("status").notNull().default("active"),
    aiEnabled: boolean("ai_enabled").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("projects_client_slug_uq").on(t.clientId, t.slug)],
);

export const channels = pgTable(
  "channels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    kind: channelKind("kind").notNull(),
    platform: text("platform").notNull(),
    displayName: text("display_name").notNull(),
    handle: text("handle"),
    mode: channelMode("mode").notNull().default("manual"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // Necesaria para que las tablas hijas usen FKs compuestas (project_id, channel_id).
  (t) => [unique("channels_project_id_id_uq").on(t.projectId, t.id)],
);

export const projectMemberships = pgTable(
  "project_memberships",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    role: projectRole("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid("created_by").references(() => users.id),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.userId] })],
);
