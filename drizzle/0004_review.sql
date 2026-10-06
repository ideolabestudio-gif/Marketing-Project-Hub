CREATE TYPE "public"."approval_decision" AS ENUM('submitted', 'approved', 'changes_requested');--> statement-breakpoint
CREATE TYPE "public"."approval_stage" AS ENUM('submission', 'internal', 'client');--> statement-breakpoint
CREATE TYPE "public"."publication_method" AS ENUM('manual', 'integration');--> statement-breakpoint
CREATE TYPE "public"."publication_status" AS ENUM('scheduled', 'published', 'cancelled');--> statement-breakpoint
CREATE TABLE "approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"content_item_id" uuid NOT NULL,
	"content_version_id" uuid NOT NULL,
	"stage" "approval_stage" NOT NULL,
	"decision" "approval_decision" NOT NULL,
	"decided_by" uuid NOT NULL,
	"client_approver_name" text,
	"evidence" text,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "approvals_project_id_id_uq" UNIQUE("project_id","id"),
	CONSTRAINT "approvals_stage_decision_ck" CHECK (("approvals"."stage" = 'submission') = ("approvals"."decision" = 'submitted')),
	CONSTRAINT "approvals_client_evidence_ck" CHECK ("approvals"."stage" <> 'client' OR (length(trim(coalesce("approvals"."client_approver_name", ''))) > 0
                                  AND length(trim(coalesce("approvals"."evidence", ''))) > 0))
);
--> statement-breakpoint
CREATE TABLE "publications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"content_item_id" uuid NOT NULL,
	"content_version_id" uuid NOT NULL,
	"method" "publication_method" DEFAULT 'manual' NOT NULL,
	"provider" text,
	"status" "publication_status" NOT NULL,
	"scheduled_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"external_url" text,
	"external_id" text,
	"note" text,
	"authorized_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cancelled_by" uuid,
	"cancelled_at" timestamp with time zone,
	CONSTRAINT "publications_project_id_id_uq" UNIQUE("project_id","id"),
	CONSTRAINT "publications_method_ck" CHECK ("publications"."method" = 'manual' OR "publications"."provider" IS NOT NULL),
	CONSTRAINT "publications_dates_ck" CHECK (("publications"."status" <> 'scheduled' OR "publications"."scheduled_at" IS NOT NULL)
       AND ("publications"."status" <> 'published' OR "publications"."published_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "require_client_approval" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "separation_of_duties" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "content_versions" ADD CONSTRAINT "content_versions_project_item_id_uq" UNIQUE("project_id","content_item_id","id");--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_item_fk" FOREIGN KEY ("project_id","content_item_id") REFERENCES "public"."content_items"("project_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_version_fk" FOREIGN KEY ("project_id","content_item_id","content_version_id") REFERENCES "public"."content_versions"("project_id","content_item_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publications" ADD CONSTRAINT "publications_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publications" ADD CONSTRAINT "publications_authorized_by_users_id_fk" FOREIGN KEY ("authorized_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publications" ADD CONSTRAINT "publications_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publications" ADD CONSTRAINT "publications_item_fk" FOREIGN KEY ("project_id","content_item_id") REFERENCES "public"."content_items"("project_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publications" ADD CONSTRAINT "publications_version_fk" FOREIGN KEY ("project_id","content_item_id","content_version_id") REFERENCES "public"."content_versions"("project_id","content_item_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "approvals_version_idx" ON "approvals" USING btree ("project_id","content_version_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "publications_one_active_per_item_uq" ON "publications" USING btree ("content_item_id") WHERE "publications"."status" <> 'cancelled';