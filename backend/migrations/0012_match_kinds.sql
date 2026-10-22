CREATE TYPE "public"."match_kind" AS ENUM('standard', 'qualification');--> statement-breakpoint
CREATE TABLE "match_clocks" (
	"match_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_answer_at" timestamp with time zone,
	CONSTRAINT "match_clocks_match_id_user_id_pk" PRIMARY KEY("match_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "kind" "match_kind" DEFAULT 'standard' NOT NULL;--> statement-breakpoint
ALTER TABLE "match_clocks" ADD CONSTRAINT "match_clocks_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_clocks" ADD CONSTRAINT "match_clocks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;