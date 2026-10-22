DROP INDEX "seasons_current_unique";--> statement-breakpoint
ALTER TABLE "seasons" ALTER COLUMN "slug" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "seasons" ALTER COLUMN "visibility" SET DEFAULT 'PUBLIC';--> statement-breakpoint
ALTER TABLE "seasons" ALTER COLUMN "visibility" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "seasons" ALTER COLUMN "owner_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "seasons" ALTER COLUMN "tags" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "seasons_slug_unique" ON "seasons" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "seasons_current_unique" ON "seasons" USING btree ("owner_id") WHERE current = true;