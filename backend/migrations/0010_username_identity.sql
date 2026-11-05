-- STEP 8 — the desk issues accounts: the USERNAME is the player's identity.
--
-- Until now a PLAYER was identified by an email address they registered
-- themselves (steps 1–7). The flow is inverted: the operator creates the
-- account, types the first password, and the player keeps THEIR OWN from the
-- first sign-in (must_change_password below makes that change compulsory).
-- Email stays as an optional contact / Google-attach address — Google sign-in
-- is still a door, so `email` and `email_verified` keep their consumer.
--
-- Also: the one-time ENTRY code is gone (a forgotten password is now a desk
-- reset + forced change), so match_codes holds one kind of secret again.

-- 1. The forced-change flag. False for every existing row: nobody was ever
--    given a desk password, so nobody owes a change. New desk-created accounts
--    set it true in code.
ALTER TABLE "users" ADD COLUMN "must_change_password" boolean DEFAULT false NOT NULL;--> statement-breakpoint

-- 2. Every row needs a handle before the column can refuse empties: derive it
--    from the display name exactly like `lib/username.ts` does (unaccent →
--    lower → non-alphanumerics to dashes), then de-duplicate case-insensitively
--    so "An" keeps "an" from being handed to a second player.
--    `unaccent` comes from 0001; it folds Đ → D, which the handle rule needs.
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

-- 3. The handle is the identity now, for every role. The old role check
--    (a player must carry an email, staff must carry a username) encoded the
--    model this migration replaces: email is optional, the handle is not.
ALTER TABLE "users" ALTER COLUMN "username" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_role_identity_check";--> statement-breakpoint

-- 4. Codes are rooms only: the entry-code half (bound to a user, consumed once)
--    lost its feature in the same decision, and a dormant column is a lie about
--    what the table is for. `match_id` becomes NOT NULL in its place.
--    (Dropping `user_id` takes `match_codes_target_check` with it — it named the
--    column — which is why the constraint is not dropped by hand here.)
ALTER TABLE "match_codes" DROP COLUMN "user_id";--> statement-breakpoint
ALTER TABLE "match_codes" DROP COLUMN "used_at";--> statement-breakpoint
ALTER TABLE "match_codes" ALTER COLUMN "match_id" SET NOT NULL;
