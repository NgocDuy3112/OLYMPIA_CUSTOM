ALTER TABLE "seasons" ADD COLUMN "slug" varchar(100);--> statement-breakpoint
ALTER TABLE "seasons" ADD COLUMN "visibility" "visibility";--> statement-breakpoint
ALTER TABLE "seasons" ADD COLUMN "owner_id" uuid;--> statement-breakpoint
ALTER TABLE "seasons" ADD COLUMN "tags" text[];--> statement-breakpoint
ALTER TABLE "seasons" ADD CONSTRAINT "seasons_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- The season takes the tournament's identity: its owner, its visibility and its tags.
UPDATE "seasons" SET
    "owner_id" = t."owner_id",
    "visibility" = t."visibility",
    "tags" = t."default_tags"
FROM "tournaments" t WHERE t."id" = "seasons"."tournament_id";--> statement-breakpoint
-- A slug from the season's name, unique across the seasons.
WITH slugs AS (
    SELECT "id", "created_at",
        trim(both '-' FROM regexp_replace(trim(both '-' FROM regexp_replace(lower("name"), '[^a-z0-9]+', '-', 'g')), '-{2,}', '-', 'g')) AS base
    FROM "seasons"
), numbered AS (
    SELECT "id",
        CASE WHEN "n" = 1 THEN "base" ELSE "base" || '-' || "n" END AS "slug"
    FROM (
        SELECT "id", "base", row_number() OVER (PARTITION BY "base" ORDER BY "created_at") AS "n"
        FROM slugs
    ) x
)
UPDATE "seasons" SET "slug" = numbered."slug" FROM numbered WHERE "seasons"."id" = numbered."id";--> statement-breakpoint
-- A season with no name to slugify still needs one.
UPDATE "seasons" SET "slug" = 'season' WHERE "slug" IS NULL OR "slug" = '';--> statement-breakpoint
UPDATE "seasons" SET "slug" = left("slug", 60) || '-' || "id" WHERE "slug" IN (SELECT "slug" FROM "seasons" GROUP BY "slug" HAVING count(*) > 1);--> statement-breakpoint
