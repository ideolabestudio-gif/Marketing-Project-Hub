import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { contentItems, contentVersions } from "./content";
import { users } from "./identity";
import { projects } from "./projects";

export const approvalStage = pgEnum("approval_stage", ["submission", "internal", "client"]);
export const approvalDecision = pgEnum("approval_decision", ["submitted", "approved", "changes_requested"]);
export const publicationMethod = pgEnum("publication_method", ["manual", "integration"]);
export const publicationStatus = pgEnum("publication_status", ["scheduled", "published", "cancelled"]);

/**
 * Hechos de revisión sobre una versión concreta (inmutables: un trigger impide UPDATE
 * y DELETE). El estado de la pieza (en revisión, aprobada…) se deduce de estas filas.
 */
export const approvals = pgTable(
  "approvals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    contentItemId: uuid("content_item_id").notNull(),
    contentVersionId: uuid("content_version_id").notNull(),
    stage: approvalStage("stage").notNull(),
    decision: approvalDecision("decision").notNull(),
    decidedBy: uuid("decided_by")
      .notNull()
      .references(() => users.id),
    clientApproverName: text("client_approver_name"),
    evidence: text("evidence"),
    comment: text("comment"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("approvals_project_id_id_uq").on(t.projectId, t.id),
    foreignKey({
      name: "approvals_item_fk",
      columns: [t.projectId, t.contentItemId],
      foreignColumns: [contentItems.projectId, contentItems.id],
    }),
    foreignKey({
      name: "approvals_version_fk",
      columns: [t.projectId, t.contentItemId, t.contentVersionId],
      foreignColumns: [contentVersions.projectId, contentVersions.contentItemId, contentVersions.id],
    }),
    check(
      "approvals_stage_decision_ck",
      sql`(${t.stage} = 'submission') = (${t.decision} = 'submitted')`,
    ),
    // La respuesta del cliente exige quién respondió y una evidencia (email, acta…).
    check(
      "approvals_client_evidence_ck",
      sql`${t.stage} <> 'client' OR (length(trim(coalesce(${t.clientApproverName}, ''))) > 0
                                  AND length(trim(coalesce(${t.evidence}, ''))) > 0)`,
    ),
    index("approvals_version_idx").on(t.projectId, t.contentVersionId, t.createdAt),
  ],
);

/**
 * Registro de una publicación o programación hecha por una persona (hoy siempre a mano
 * en Metricool/MailerLite). Un trigger de BD rechaza insertar una publicación de una
 * versión que no sea la última o que no tenga las aprobaciones exigidas.
 */
export const publications = pgTable(
  "publications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    contentItemId: uuid("content_item_id").notNull(),
    contentVersionId: uuid("content_version_id").notNull(),
    method: publicationMethod("method").notNull().default("manual"),
    provider: text("provider"),
    status: publicationStatus("status").notNull(),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    externalUrl: text("external_url"),
    externalId: text("external_id"),
    note: text("note"),
    authorizedBy: uuid("authorized_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    cancelledBy: uuid("cancelled_by").references(() => users.id),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  },
  (t) => [
    unique("publications_project_id_id_uq").on(t.projectId, t.id),
    foreignKey({
      name: "publications_item_fk",
      columns: [t.projectId, t.contentItemId],
      foreignColumns: [contentItems.projectId, contentItems.id],
    }),
    foreignKey({
      name: "publications_version_fk",
      columns: [t.projectId, t.contentItemId, t.contentVersionId],
      foreignColumns: [contentVersions.projectId, contentVersions.contentItemId, contentVersions.id],
    }),
    check("publications_method_ck", sql`${t.method} = 'manual' OR ${t.provider} IS NOT NULL`),
    check(
      "publications_dates_ck",
      sql`(${t.status} <> 'scheduled' OR ${t.scheduledAt} IS NOT NULL)
       AND (${t.status} <> 'published' OR ${t.publishedAt} IS NOT NULL)`,
    ),
    // Como mucho una publicación activa (no cancelada) por pieza.
    uniqueIndex("publications_one_active_per_item_uq")
      .on(t.contentItemId)
      .where(sql`${t.status} <> 'cancelled'`),
  ],
);
