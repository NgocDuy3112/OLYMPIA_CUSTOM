import type { users, tournaments } from "../db/schema/index.js";

type SessionUser = typeof users.$inferSelect;
type TournamentRow = typeof tournaments.$inferSelect;

// PRIVATE = ADMIN only. Callers turn a false into 404 so existence never leaks.
export function canViewTournament(
    row: Pick<TournamentRow, "visibility">,
    user: SessionUser
): boolean {
    if (row.visibility === "PUBLIC") return true;
    return user.role === "ADMIN";
}

// Writes: ADMIN anywhere, otherwise the owner of a PUBLIC tournament.
export function canWriteTournament(
    row: Pick<TournamentRow, "visibility" | "ownerId">,
    user: SessionUser
): boolean {
    if (user.role === "ADMIN") return true;
    return row.visibility === "PUBLIC" && row.ownerId === user.id;
}
