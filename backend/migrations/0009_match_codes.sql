CREATE TABLE "match_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(6) NOT NULL,
	"match_id" uuid,
	"user_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_codes_code_unique" UNIQUE("code"),
	CONSTRAINT "match_codes_target_check" CHECK ((("match_id" IS NULL) <> ("user_id" IS NULL)))
);--> statement-breakpoint
ALTER TABLE "match_codes" ADD CONSTRAINT "match_codes_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_codes" ADD CONSTRAINT "match_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_codes" ADD CONSTRAINT "match_codes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "match_codes_match_idx" ON "match_codes" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX "match_codes_user_idx" ON "match_codes" USING btree ("user_id");
