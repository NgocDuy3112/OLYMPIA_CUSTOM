CREATE TABLE "match_live" (
	"match_id" uuid PRIMARY KEY NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"round_id" text NOT NULL,
	"state" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_live_version_check" CHECK (version >= 0)
);
--> statement-breakpoint
ALTER TABLE "match_live" ADD CONSTRAINT "match_live_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;