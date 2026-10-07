CREATE TYPE "public"."ai_generation_status" AS ENUM('draft', 'used', 'discarded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."ai_purpose" AS ENUM('copy_draft', 'ideas', 'report_interpretation');--> statement-breakpoint
ALTER TYPE "public"."report_section_kind" ADD VALUE 'ai_interpretation';--> statement-breakpoint
CREATE TABLE "ai_generations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"cycle_id" uuid NOT NULL,
	"content_item_id" uuid,
	"purpose" "ai_purpose" NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"prompt_template" text NOT NULL,
	"prompt_template_version" integer NOT NULL,
	"instructions" text,
	"input_refs" jsonb NOT NULL,
	"output" text DEFAULT '' NOT NULL,
	"error" text,
	"status" "ai_generation_status" DEFAULT 'draft' NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cost_usd" numeric(10, 6) DEFAULT 0 NOT NULL,
	"requested_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "ai_generations_project_id_id_uq" UNIQUE("project_id","id"),
	CONSTRAINT "ai_generations_project_item_id_uq" UNIQUE("project_id","content_item_id","id"),
	CONSTRAINT "ai_generations_item_ck" CHECK (("ai_generations"."purpose" = 'copy_draft') = ("ai_generations"."content_item_id" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "content_versions" DROP CONSTRAINT "content_versions_origin_human_ck";--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "ai_monthly_limit_usd" numeric(8, 2) DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "content_versions" ADD COLUMN "ai_generation_id" uuid;--> statement-breakpoint
ALTER TABLE "report_sections" ADD COLUMN "ai_generation_id" uuid;--> statement-breakpoint
ALTER TABLE "report_sections" ADD COLUMN "reviewed_by" uuid;--> statement-breakpoint
ALTER TABLE "report_sections" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ai_generations" ADD CONSTRAINT "ai_generations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_generations" ADD CONSTRAINT "ai_generations_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_generations" ADD CONSTRAINT "ai_generations_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_generations" ADD CONSTRAINT "ai_generations_cycle_fk" FOREIGN KEY ("project_id","cycle_id") REFERENCES "public"."cycles"("project_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_generations" ADD CONSTRAINT "ai_generations_item_fk" FOREIGN KEY ("project_id","content_item_id") REFERENCES "public"."content_items"("project_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_generations_project_created_idx" ON "ai_generations" USING btree ("project_id","created_at");--> statement-breakpoint
ALTER TABLE "content_versions" ADD CONSTRAINT "content_versions_ai_generation_fk" FOREIGN KEY ("project_id","content_item_id","ai_generation_id") REFERENCES "public"."ai_generations"("project_id","content_item_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_sections" ADD CONSTRAINT "report_sections_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_sections" ADD CONSTRAINT "report_sections_ai_generation_fk" FOREIGN KEY ("project_id","ai_generation_id") REFERENCES "public"."ai_generations"("project_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_versions" ADD CONSTRAINT "content_versions_origin_ai_ck" CHECK (("content_versions"."origin" = 'ai_assisted') = ("content_versions"."ai_generation_id" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "report_sections" ADD CONSTRAINT "report_sections_ai_ck" CHECK (("report_sections"."kind"::text = 'ai_interpretation') = ("report_sections"."ai_generation_id" IS NOT NULL));