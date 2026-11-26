CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE INDEX "audit_events_details_trgm_idx" ON "audit_events" USING gin (("details"::text) gin_trgm_ops);
