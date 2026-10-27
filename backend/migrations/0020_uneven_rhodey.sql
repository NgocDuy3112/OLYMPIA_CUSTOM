CREATE TABLE "match_tie_breaks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" uuid NOT NULL,
	"rank" integer NOT NULL,
	"question_id" uuid NOT NULL,
	"entries" jsonb NOT NULL,
	"placement" jsonb NOT NULL,
	"resolved_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "match_tie_breaks" ADD CONSTRAINT "match_tie_breaks_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "match_tie_break_unique" ON "match_tie_breaks" USING btree ("match_id","rank");