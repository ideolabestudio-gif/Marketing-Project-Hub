-- Nuevo tipo de canal «shop» (tienda online). En vez de ALTER TYPE … ADD VALUE se recrea el
-- tipo: así el valor nuevo se puede usar en la migración siguiente aunque ambas se apliquen
-- en la misma transacción.
ALTER TYPE "public"."channel_kind" RENAME TO "channel_kind_old";--> statement-breakpoint
CREATE TYPE "public"."channel_kind" AS ENUM('social', 'email', 'shop');--> statement-breakpoint
ALTER TABLE "channels" ALTER COLUMN "kind" TYPE "public"."channel_kind" USING "kind"::text::"public"."channel_kind";--> statement-breakpoint
ALTER TABLE "metric_definitions" ALTER COLUMN "kind" TYPE "public"."channel_kind" USING "kind"::text::"public"."channel_kind";--> statement-breakpoint
DROP TYPE "public"."channel_kind_old";
