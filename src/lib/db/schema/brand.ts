import { check, foreignKey, index, integer, pgEnum, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { assets } from "./content";
import { users } from "./identity";
import { projects } from "./projects";

/**
 * Ficha del cliente: contexto de marca que no cambia cada mes (quién es, público, tono…).
 * Cada guardado es una versión nueva e inmutable (un trigger impide UPDATE/DELETE);
 * la vigente es la de número más alto. La IA la recibe junto al brief del mes.
 */
export const brandProfiles = pgTable(
  "brand_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    versionNo: integer("version_no").notNull(),
    about: text("about").notNull().default(""),
    audience: text("audience").notNull().default(""),
    voice: text("voice").notNull().default(""),
    offering: text("offering").notNull().default(""),
    keywords: text("keywords").notNull().default(""),
    avoid: text("avoid").notNull().default(""),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("brand_profiles_project_id_id_uq").on(t.projectId, t.id),
    unique("brand_profiles_project_version_uq").on(t.projectId, t.versionNo),
    check("brand_profiles_version_no_ck", sql`${t.versionNo} >= 1`),
  ],
);

export const libraryCategory = pgEnum("library_category", ["logo", "brand_guide", "photo", "template", "other"]);

/**
 * Biblioteca de materiales del proyecto (logos, manual de marca, fotos, plantillas).
 * Apunta a un activo inmutable: quitarlo de la biblioteca no lo borra de las versiones
 * de las piezas que ya lo usan.
 */
export const libraryItems = pgTable(
  "library_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    assetId: uuid("asset_id").notNull(),
    category: libraryCategory("category").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("library_items_project_id_id_uq").on(t.projectId, t.id),
    unique("library_items_project_asset_uq").on(t.projectId, t.assetId),
    foreignKey({
      name: "library_items_asset_fk",
      columns: [t.projectId, t.assetId],
      foreignColumns: [assets.projectId, assets.id],
    }),
    index("library_items_project_idx").on(t.projectId, t.category),
  ],
);
