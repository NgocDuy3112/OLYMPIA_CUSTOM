import type { users, seasons } from "../db/schema/index.js";

type SessionUser = typeof users.$inferSelect;
type SeasonRow = typeof seasons.$inferSelect;

// PRIVATE = ADMIN only. Callers turn a false into 404 so existence never leaks.
export function canViewSeason(
    row: Pick<SeasonRow, "visibility">,
    user: SessionUser
): boolean {
    if (row.visibility === "PUBLIC") return true;
    return user.role === "ADMIN";
}

// Writes: ADMIN anywhere, otherwise the owner of a PUBLIC season.
export function canWriteSeason(
    row: Pick<SeasonRow, "visibility" | "ownerId">,
    user: SessionUser
): boolean {
    if (user.role === "ADMIN") return true;
    return row.visibility === "PUBLIC" && row.ownerId === user.id;
}
