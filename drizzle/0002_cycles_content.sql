CREATE TYPE "public"."cycle_status" AS ENUM('planning', 'production', 'review', 'publishing', 'reporting', 'closed');--> statement-breakpoint
CREATE TYPE "public"."asset_kind" AS ENUM('file', 'link');--> statement-breakpoint
CREATE TYPE "public"."content_item_status" AS ENUM('idea', 'draft', 'in_review', 'changes_requested', 'approved', 'scheduled', 'published', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."content_origin" AS ENUM('human', 'ai_assisted');--> statement-breakpoint
CREATE TABLE "cycles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"period" text NOT NULL,
	"status" "cycle_status" DEFAULT 'planning' NOT NULL,
	"objectives" text,
	"key_dates" text,
	"notes" text,
	"learnings" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"closed_at" timestamp with time zone,
	"closed_by" uuid,
	CONSTRAINT "cycles_project_id_id_uq" UNIQUE("project_id","id"),
	CONSTRAINT "cycles_project_period_uq" UNIQUE("project_id","period")
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"kind" "asset_kind" NOT NULL,
	"storage_key" text,
	"url" text,
	"filename" text NOT NULL,
	"mime_type" text,
	"size_bytes" bigint,
	"sha256" text,
	"uploaded_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assets_project_id_id_uq" UNIQUE("project_id","id"),
	CONSTRAINT "assets_kind_ck" CHECK (("assets"."kind" = 'file' AND "assets"."storage_key" IS NOT NULL AND "assets"."sha256" IS NOT NULL
            AND "assets"."storage_key" LIKE 'projects/' || "assets"."project_id"::text || '/%')
       OR ("assets"."kind" = 'link' AND "assets"."url" IS NOT NULL AND "assets"."storage_key" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"content_item_id" uuid NOT NULL,
	"content_version_id" uuid,
	"body" text NOT NULL,
	"author_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comments_project_id_id_uq" UNIQUE("project_id","id")
);
--> statement-breakpoint
CREATE TABLE "content_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"cycle_id" uuid NOT NULL,
	"channel_id" uuid NOT NULL,
	"format" text NOT NULL,
	"title" text NOT NULL,
	"planned_at" timestamp with time zone,
	"status" "content_item_status" DEFAULT 'idea' NOT NULL,
	"assignee_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	CONSTRAINT "content_items_project_id_id_uq" UNIQUE("project_id","id")
);
--> statement-breakpoint
CREATE TABLE "content_version_assets" (
	"project_id" uuid NOT NULL,
	"content_version_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "content_version_assets_content_version_id_asset_id_pk" PRIMARY KEY("content_version_id","asset_id")
);
--> statement-breakpoint
CREATE TABLE "content_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"content_item_id" uuid NOT NULL,
	"version_no" integer NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"email_subject" text,
	"email_preheader" text,
	"link_url" text,
	"note" text,
	"origin" "content_origin" DEFAULT 'human' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_versions_project_id_id_uq" UNIQUE("project_id","id"),
	CONSTRAINT "content_versions_item_version_uq" UNIQUE("content_item_id","version_no"),
	CONSTRAINT "content_versions_origin_human_ck" CHECK ("content_versions"."origin" = 'human'),
	CONSTRAINT "content_versions_version_no_ck" CHECK ("content_versions"."version_no" >= 1)
);
--> statement-breakpoint
ALTER TABLE "cycles" ADD CONSTRAINT "cycles_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cycles" ADD CONSTRAINT "cycles_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cycles" ADD CONSTRAINT "cycles_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_item_fk" FOREIGN KEY ("project_id","content_item_id") REFERENCES "public"."content_items"("project_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_version_fk" FOREIGN KEY ("project_id","content_version_id") REFERENCES "public"."content_versions"("project_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_cycle_fk" FOREIGN KEY ("project_id","cycle_id") REFERENCES "public"."cycles"("project_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_channel_fk" FOREIGN KEY ("project_id","channel_id") REFERENCES "public"."channels"("project_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_version_assets" ADD CONSTRAINT "content_version_assets_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_version_assets" ADD CONSTRAINT "content_version_assets_version_fk" FOREIGN KEY ("project_id","content_version_id") REFERENCES "public"."content_versions"("project_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_version_assets" ADD CONSTRAINT "content_version_assets_asset_fk" FOREIGN KEY ("project_id","asset_id") REFERENCES "public"."assets"("project_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_versions" ADD CONSTRAINT "content_versions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_versions" ADD CONSTRAINT "content_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_versions" ADD CONSTRAINT "content_versions_item_fk" FOREIGN KEY ("project_id","content_item_id") REFERENCES "public"."content_items"("project_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "content_items_cycle_idx" ON "content_items" USING btree ("project_id","cycle_id");