CREATE TABLE "claim_attempts" (
	"user_id" uuid PRIMARY KEY NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
	"attempts" integer NOT NULL DEFAULT 0,
	"window_start" timestamptz NOT NULL,
	"locked_until" timestamptz,
	"updated_at" timestamptz NOT NULL DEFAULT now()
);
