// A player's LOGIN HANDLE, derived from the name the desk typed:
//
//     "Ngọc Duy"  →  ngoc-duy
//
// The name is what the rail, the standings and the projector read, so it is
// kept as `displayName` and never asked for twice; the handle exists only to be
// typed at a login form. Step 8 made it the player's identity (username is the
// key, email is optional), which is why every creator — the roster, Google
// provisioning, the dev fixture — funnels through here.
//
// The rule must be byte-identical to the backfill in `0010_username_identity.sql`
// (same folding, same de-dup order), or a row written by the app and a row
// written by the migration would disagree about what a handle looks like.
import { randomInt } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db/pool.js";
import { users } from "../db/schema/index.js";

/** Room for a "-12" suffix: `users.username` is varchar(50). */
const MAX_HANDLE = 45;

/**
 * Fold a name into a handle: strip the Vietnamese diacritics (NFD + drop the
 * combining marks — and Đ by hand, it does not decompose), then keep only
 * letters and digits, joined by single dashes.
 *
 * An untypeable name ("///") still has to produce a loginable handle, so the
 * fallback is the generic `player` (de-duplicated below like any other).
 */
export function slugifyUsername(raw: string): string {
    const ascii = raw
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/đ/g, "d");
    const slug = ascii
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, MAX_HANDLE)
        .replace(/-+$/g, "");
    return slug.length > 0 ? slug : "player";
}

/**
 * A free handle for this name — `ngoc-duy`, then `ngoc-duy-2`, `ngoc-duy-3`…
 *
 * De-duplication reads with `lower()` because handles are spoken and typed, so
 * "An" already occupying the name must keep "an" from being minted for somebody
 * else: two accounts one keystroke apart would be a login that silently lands
 * on the wrong player.
 *
 * `executor` is the caller's handle — inside the roster's transaction, inside
 * Google's provisioning transaction, or the pool itself.
 */
export async function pickUsername(
    executor: typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0],
    displayName: string
): Promise<string> {
    const base = slugifyUsername(displayName);

    for (let n = 1; n <= 50; n += 1) {
        const candidate = n === 1 ? base : `${base}-${n}`;
        const [taken] = await executor
            .select({ id: users.id })
            .from(users)
            .where(sql`lower(${users.username}) = ${candidate}`)
            .limit(1);
        if (!taken) return candidate;
    }

    // Fifty same-named players is not a roster, so fall back to a number nobody
    // picked — still lower-case, still typeable.
    return `${base}-${randomInt(100, 1000)}`;
}
