ALTER TABLE "question_bank" ADD COLUMN "tags" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
UPDATE "question_bank" SET "payload" = "payload" || jsonb_build_object('type', CASE "kind" WHEN 'HINT' THEN 'TEXT' ELSE "kind" END) WHERE NOT ("payload" ? 'type');--> statement-breakpoint
ALTER TABLE "question_bank" ADD COLUMN "type" text GENERATED ALWAYS AS (payload ->> 'type') STORED;--> statement-breakpoint
ALTER TABLE "question_bank" ALTER COLUMN "type" SET NOT NULL;--> statement-breakpoint
UPDATE "question_bank" SET "tags" = ARRAY["payload" ->> 'bucket'] WHERE "tags" = '{}' AND "payload" ? 'bucket' AND "payload" ->> 'bucket' IS NOT NULL;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "assembly_revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "assembled_at" timestamptz;--> statement-breakpoint
CREATE TABLE "match_assembly_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"actor_id" uuid NOT NULL,
	"mode" text DEFAULT 'replace' NOT NULL,
	"added_count" integer DEFAULT 0 NOT NULL,
	"removed_count" integer DEFAULT 0 NOT NULL,
	"source_ids" text[] NOT NULL,
	"at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "match_assembly_events" ADD CONSTRAINT "match_assembly_events_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_assembly_events" ADD CONSTRAINT "match_assembly_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "match_assembly_events_match_idx" ON "match_assembly_events" ("match_id","revision");
