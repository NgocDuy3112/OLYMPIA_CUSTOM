ALTER TABLE "matches" ADD COLUMN "controller_id" uuid;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "controller_heartbeat_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_controller_id_users_id_fk" FOREIGN KEY ("controller_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
