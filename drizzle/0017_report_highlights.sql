CREATE TABLE "report_highlights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"report_id" uuid NOT NULL,
	"channel_id" uuid NOT NULL,
	"metric_key" text NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "report_highlights_project_id_id_uq" UNIQUE("project_id","id"),
	CONSTRAINT "report_highlights_metric_uq" UNIQUE("report_id","channel_id","metric_key")
);
--> statement-breakpoint
ALTER TABLE "report_highlights" ADD CONSTRAINT "report_highlights_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_highlights" ADD CONSTRAINT "report_highlights_metric_key_metric_definitions_key_fk" FOREIGN KEY ("metric_key") REFERENCES "public"."metric_definitions"("key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_highlights" ADD CONSTRAINT "report_highlights_report_fk" FOREIGN KEY ("project_id","report_id") REFERENCES "public"."reports"("project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_highlights" ADD CONSTRAINT "report_highlights_channel_fk" FOREIGN KEY ("project_id","channel_id") REFERENCES "public"."channels"("project_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Con el informe aprobado, sus cifras destacadas quedan bloqueadas (misma regla que las secciones).
CREATE TRIGGER report_highlights_guard
  BEFORE INSERT OR UPDATE OR DELETE ON report_highlights
  FOR EACH ROW EXECUTE FUNCTION mph_guard_report_sections();
