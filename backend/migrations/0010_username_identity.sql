
ALTER TABLE "users" ADD COLUMN "must_change_password" boolean DEFAULT false NOT NULL;--> statement-breakpoint

DO $$
DECLARE
    row record;
    base text;
    candidate text;
    n int;
BEGIN
    FOR row IN SELECT id, display_name FROM users WHERE username IS NULL ORDER BY created_at LOOP
        base := left(
            regexp_replace(lower(unaccent(coalesce(row.display_name, ''))), '[^a-z0-9]+', '-', 'g'),
            45
        );
        base := trim(both '-' from base);
        IF base = '' THEN
            base := 'player';
        END IF;

        candidate := base;
        n := 1;
        WHILE EXISTS (SELECT 1 FROM users u WHERE lower(u.username) = candidate) LOOP
            n := n + 1;
            candidate := base || '-' || n;
        END LOOP;

        UPDATE users SET username = candidate WHERE id = row.id;
    END LOOP;
END $$;--> statement-breakpoint

ALTER TABLE "users" ALTER COLUMN "username" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_role_identity_check";--> statement-breakpoint

ALTER TABLE "match_codes" DROP COLUMN "user_id";--> statement-breakpoint
ALTER TABLE "match_codes" DROP COLUMN "used_at";--> statement-breakpoint
ALTER TABLE "match_codes" ALTER COLUMN "match_id" SET NOT NULL;
