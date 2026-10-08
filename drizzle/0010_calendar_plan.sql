ALTER TYPE "public"."ai_purpose" ADD VALUE 'calendar_plan';--> statement-breakpoint
ALTER TABLE "content_items" ADD COLUMN "ai_generation_id" uuid;--> statement-breakpoint
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_ai_generation_fk" FOREIGN KEY ("project_id","ai_generation_id") REFERENCES "public"."ai_generations"("project_id","id") ON DELETE no action ON UPDATE no action;