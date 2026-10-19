CREATE TABLE "asset_files" (
	"project_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"bytes" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "asset_files_project_id_asset_id_pk" PRIMARY KEY("project_id","asset_id")
);
--> statement-breakpoint
ALTER TABLE "asset_files" ADD CONSTRAINT "asset_files_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_files" ADD CONSTRAINT "asset_files_asset_fk" FOREIGN KEY ("project_id","asset_id") REFERENCES "public"."assets"("project_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- El contenido de un archivo es inmutable, como el activo al que pertenece.
CREATE TRIGGER asset_files_immutable
  BEFORE UPDATE OR DELETE ON asset_files
  FOR EACH ROW EXECUTE FUNCTION mph_forbid_mutation();
