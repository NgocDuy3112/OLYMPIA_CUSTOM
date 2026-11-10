CREATE TYPE "public"."recording_status" AS ENUM('RECORDING', 'STOPPED', 'FAILED');--> statement-breakpoint
CREATE TABLE "recordings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" uuid NOT NULL,
	"egress_id" text,
	"status" "recording_status" NOT NULL,
	"s3_key" text,
	"started_by" uuid,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"stopped_at" timestamp with time zone,
	"error" text,
	CONSTRAINT "recordings_egress_id_unique" UNIQUE("egress_id")
);
--> statement-breakpoint
ALTER TABLE "recordings" ADD CONSTRAINT "recordings_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recordings" ADD CONSTRAINT "recordings_started_by_users_id_fk" FOREIGN KEY ("started_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recordings_match_idx" ON "recordings" USING btree ("match_id");--> statement-breakpoint
CREATE UNIQUE INDEX "recordings_active_unique" ON "recordings" USING btree ("match_id") WHERE status = 'RECORDING';