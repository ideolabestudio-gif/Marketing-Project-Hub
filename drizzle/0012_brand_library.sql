CREATE TYPE "public"."library_category" AS ENUM('logo', 'brand_guide', 'photo', 'template', 'other');--> statement-breakpoint
CREATE TABLE "brand_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"version_no" integer NOT NULL,
	"about" text DEFAULT '' NOT NULL,
	"audience" text DEFAULT '' NOT NULL,
	"voice" text DEFAULT '' NOT NULL,
	"offering" text DEFAULT '' NOT NULL,
	"keywords" text DEFAULT '' NOT NULL,
	"avoid" text DEFAULT '' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brand_profiles_project_id_id_uq" UNIQUE("project_id","id"),
	CONSTRAINT "brand_profiles_project_version_uq" UNIQUE("project_id","version_no"),
	CONSTRAINT "brand_profiles_version_no_ck" CHECK ("brand_profiles"."version_no" >= 1)
);
--> statement-breakpoint
CREATE TABLE "library_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"category" "library_category" NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "library_items_project_id_id_uq" UNIQUE("project_id","id"),
	CONSTRAINT "library_items_project_asset_uq" UNIQUE("project_id","asset_id")
);
--> statement-breakpoint
ALTER TABLE "brand_profiles" ADD CONSTRAINT "brand_profiles_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_profiles" ADD CONSTRAINT "brand_profiles_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_items" ADD CONSTRAINT "library_items_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_items" ADD CONSTRAINT "library_items_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_items" ADD CONSTRAINT "library_items_asset_fk" FOREIGN KEY ("project_id","asset_id") REFERENCES "public"."assets"("project_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "library_items_project_idx" ON "library_items" USING btree ("project_id","category");--> statement-breakpoint
-- La ficha del cliente es inmutable: cambiarla = guardar una versión nueva.
CREATE TRIGGER brand_profiles_immutable
  BEFORE UPDATE OR DELETE ON brand_profiles
  FOR EACH ROW EXECUTE FUNCTION mph_forbid_mutation();
