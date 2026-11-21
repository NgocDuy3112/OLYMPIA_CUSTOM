CREATE TABLE "password_reset_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
	"code_hash" text NOT NULL,
	"salt" text NOT NULL,
	"expires_at" timestamptz NOT NULL,
	"used_at" timestamptz,
	"attempts" integer NOT NULL DEFAULT 0,
	"created_at" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE INDEX "password_reset_codes_user_id_idx" ON "password_reset_codes" USING btree ("user_id");