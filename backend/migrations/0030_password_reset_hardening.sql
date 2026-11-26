CREATE UNIQUE INDEX "password_reset_codes_user_active_unique" ON "password_reset_codes" USING btree ("user_id") WHERE "used_at" IS NULL;--> statement-breakpoint
CREATE INDEX "password_reset_codes_expires_at_idx" ON "password_reset_codes" USING btree ("expires_at");
