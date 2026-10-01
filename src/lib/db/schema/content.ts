import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { cycles } from "./cycles";
import { users } from "./identity";
import { channels, projects } from "./projects";

export const contentItemStatus = pgEnum("content_item_status", [
  "idea",
  "draft",
  "in_review",
  "changes_requested",
  "approved",
  "scheduled",
  "published",
  "cancelled",
]);
export const contentOrigin = pgEnum("content_origin", ["human", "ai_assisted"]);
export const assetKind = pgEnum("asset_kind", ["file", "link"]);

/** Pieza planificada (post, reel, email…) dentro de un ciclo y un canal. */
export const contentItems = pgTable(
  "content_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    cycleId: uuid("cycle_id").notNull(),
    channelId: uuid("channel_id").notNull(),
    format: text("format").notNull(),
    title: text("title").notNull(),
    plannedAt: timestamp("planned_at", { withTimezone: true }),
    status: contentItemStatus("status").notNull().default("idea"),
    assigneeId: uuid("assignee_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid("created_by").references(() => users.id),
  },
  (t) => [
    unique("content_items_project_id_id_uq").on(t.projectId, t.id),
    foreignKey({ name: "content_items_cycle_fk", columns: [t.projectId, t.cycleId], foreignColumns: [cycles.projectId, cycles.id] }),
    foreignKey({ name: "content_items_channel_fk", columns: [t.projectId, t.channelId], foreignColumns: [channels.projectId, channels.id] }),
    index("content_items_cycle_idx").on(t.projectId, t.cycleId),
  ],
);

/**
 * Versión inmutable del contenido de una pieza (un trigger impide UPDATE/DELETE).
 * Editar = crear una versión nueva. Las aprobaciones (F3) apuntan a una versión.
 */
export const contentVersions = pgTable(
  "content_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    contentItemId: uuid("content_item_id").notNull(),
    versionNo: integer("version_no").notNull(),
    body: text("body").notNull().default(""),
    emailSubject: text("email_subject"),
    emailPreheader: text("email_preheader"),
    linkUrl: text("link_url"),
    note: text("note"),
    // En F5 se añadirá ai_generation_id y se relajará el CHECK para 'ai_assisted'.
    origin: contentOrigin("origin").notNull().default("human"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("content_versions_project_id_id_uq").on(t.projectId, t.id),
    unique("content_versions_item_version_uq").on(t.contentItemId, t.versionNo),
    foreignKey({
      name: "content_versions_item_fk",
      columns: [t.projectId, t.contentItemId],
      foreignColumns: [contentItems.projectId, contentItems.id],
    }),
    check("content_versions_origin_human_ck", sql`${t.origin} = 'human'`),
    check("content_versions_version_no_ck", sql`${t.versionNo} >= 1`),
  ],
);

/**
 * Archivo subido (guardado en el almacenamiento con clave projects/{project_id}/…) o
 * enlace externo. Inmutable: un archivo aprobado no puede cambiar después.
 */
export const assets = pgTable(
  "assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    kind: assetKind("kind").notNull(),
    storageKey: text("storage_key"),
    url: text("url"),
    filename: text("filename").notNull(),
    mimeType: text("mime_type"),
    sizeBytes: bigint("size_bytes", { mode: "number" }),
    sha256: text("sha256"),
    uploadedBy: uuid("uploaded_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("assets_project_id_id_uq").on(t.projectId, t.id),
    check(
      "assets_kind_ck",
      sql`(${t.kind} = 'file' AND ${t.storageKey} IS NOT NULL AND ${t.sha256} IS NOT NULL
            AND ${t.storageKey} LIKE 'projects/' || ${t.projectId}::text || '/%')
       OR (${t.kind} = 'link' AND ${t.url} IS NOT NULL AND ${t.storageKey} IS NULL)`,
    ),
  ],
);

/** Activos que forman parte de una versión. Inmutable, como la versión. */
export const contentVersionAssets = pgTable(
  "content_version_assets",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    contentVersionId: uuid("content_version_id").notNull(),
    assetId: uuid("asset_id").notNull(),
    position: integer("position").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.contentVersionId, t.assetId] }),
    foreignKey({
      name: "content_version_assets_version_fk",
      columns: [t.projectId, t.contentVersionId],
      foreignColumns: [contentVersions.projectId, contentVersions.id],
    }),
    foreignKey({
      name: "content_version_assets_asset_fk",
      columns: [t.projectId, t.assetId],
      foreignColumns: [assets.projectId, assets.id],
    }),
  ],
);

export const comments = pgTable(
  "comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    contentItemId: uuid("content_item_id").notNull(),
    contentVersionId: uuid("content_version_id"),
    body: text("body").notNull(),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("comments_project_id_id_uq").on(t.projectId, t.id),
    foreignKey({
      name: "comments_item_fk",
      columns: [t.projectId, t.contentItemId],
      foreignColumns: [contentItems.projectId, contentItems.id],
    }),
    foreignKey({
      name: "comments_version_fk",
      columns: [t.projectId, t.contentVersionId],
      foreignColumns: [contentVersions.projectId, contentVersions.id],
    }),
  ],
);
