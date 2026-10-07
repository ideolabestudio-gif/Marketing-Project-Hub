CREATE TYPE "public"."metric_aggregation" AS ENUM('sum', 'last', 'average', 'max');--> statement-breakpoint
CREATE TYPE "public"."metric_import_status" AS ENUM('pending', 'applied', 'discarded');--> statement-breakpoint
CREATE TYPE "public"."metric_source" AS ENUM('manual', 'csv_import', 'integration');--> statement-breakpoint
CREATE TYPE "public"."metric_unit" AS ENUM('count', 'percent', 'currency', 'seconds');--> statement-breakpoint
CREATE TYPE "public"."report_section_kind" AS ENUM('data', 'publications', 'human_analysis');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('draft', 'approved');--> statement-breakpoint
CREATE TABLE "metric_definitions" (
	"key" text PRIMARY KEY NOT NULL,
	"kind" "channel_kind" NOT NULL,
	"label" text NOT NULL,
	"unit" "metric_unit" NOT NULL,
	"description" text NOT NULL,
	"source_note" text,
	"default_aggregation" "metric_aggregation" DEFAULT 'sum' NOT NULL,
	"position" integer DEFAULT 100 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "metric_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"cycle_id" uuid NOT NULL,
	"channel_id" uuid NOT NULL,
	"filename" text NOT NULL,
	"raw_csv" text NOT NULL,
	"row_count" integer NOT NULL,
	"status" "metric_import_status" DEFAULT 'pending' NOT NULL,
	"uploaded_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "metric_imports_project_id_id_uq" UNIQUE("project_id","id")
);
--> statement-breakpoint
CREATE TABLE "metric_values" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"cycle_id" uuid NOT NULL,
	"channel_id" uuid NOT NULL,
	"content_item_id" uuid,
	"metric_key" text NOT NULL,
	"value" numeric(20, 4) NOT NULL,
	"source" "metric_source" NOT NULL,
	"import_id" uuid,
	"source_detail" text,
	"note" text,
	"supersedes_id" uuid,
	"captured_by" uuid NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "metric_values_project_id_id_uq" UNIQUE("project_id","id"),
	CONSTRAINT "metric_values_import_ck" CHECK (("metric_values"."source" = 'csv_import') = ("metric_values"."import_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "report_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"report_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"kind" "report_section_kind" NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"channel_id" uuid,
	"compare_previous" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "report_sections_project_id_id_uq" UNIQUE("project_id","id")
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"cycle_id" uuid NOT NULL,
	"status" "report_status" DEFAULT 'draft' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	CONSTRAINT "reports_project_id_id_uq" UNIQUE("project_id","id"),
	CONSTRAINT "reports_project_cycle_uq" UNIQUE("project_id","cycle_id")
);
--> statement-breakpoint
ALTER TABLE "metric_imports" ADD CONSTRAINT "metric_imports_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metric_imports" ADD CONSTRAINT "metric_imports_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metric_imports" ADD CONSTRAINT "metric_imports_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metric_imports" ADD CONSTRAINT "metric_imports_cycle_fk" FOREIGN KEY ("project_id","cycle_id") REFERENCES "public"."cycles"("project_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metric_imports" ADD CONSTRAINT "metric_imports_channel_fk" FOREIGN KEY ("project_id","channel_id") REFERENCES "public"."channels"("project_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metric_values" ADD CONSTRAINT "metric_values_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metric_values" ADD CONSTRAINT "metric_values_metric_key_metric_definitions_key_fk" FOREIGN KEY ("metric_key") REFERENCES "public"."metric_definitions"("key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metric_values" ADD CONSTRAINT "metric_values_captured_by_users_id_fk" FOREIGN KEY ("captured_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metric_values" ADD CONSTRAINT "metric_values_cycle_fk" FOREIGN KEY ("project_id","cycle_id") REFERENCES "public"."cycles"("project_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metric_values" ADD CONSTRAINT "metric_values_channel_fk" FOREIGN KEY ("project_id","channel_id") REFERENCES "public"."channels"("project_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metric_values" ADD CONSTRAINT "metric_values_item_fk" FOREIGN KEY ("project_id","content_item_id") REFERENCES "public"."content_items"("project_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metric_values" ADD CONSTRAINT "metric_values_import_fk" FOREIGN KEY ("project_id","import_id") REFERENCES "public"."metric_imports"("project_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metric_values" ADD CONSTRAINT "metric_values_supersedes_fk" FOREIGN KEY ("project_id","supersedes_id") REFERENCES "public"."metric_values"("project_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_sections" ADD CONSTRAINT "report_sections_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_sections" ADD CONSTRAINT "report_sections_report_fk" FOREIGN KEY ("project_id","report_id") REFERENCES "public"."reports"("project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_sections" ADD CONSTRAINT "report_sections_channel_fk" FOREIGN KEY ("project_id","channel_id") REFERENCES "public"."channels"("project_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_cycle_fk" FOREIGN KEY ("project_id","cycle_id") REFERENCES "public"."cycles"("project_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "metric_values_supersedes_uq" ON "metric_values" USING btree ("supersedes_id") WHERE "metric_values"."supersedes_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "metric_values_cycle_idx" ON "metric_values" USING btree ("project_id","cycle_id");