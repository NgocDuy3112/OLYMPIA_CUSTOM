import { canViewTournament } from "../../lib/tournament-access.js";
import { requireTournament } from "../questions/service.js";
import { ToolError } from "./result.js";


export async function assertTournamentVisible(
    tournamentId: string,
    role: string | null
): Promise<void> {
    const parent = await requireTournament(tournamentId);
    const user = { role } as unknown as Parameters<typeof canViewTournament>[1];
    if (!canViewTournament(parent, user)) {
        throw new ToolError("NOT_FOUND", `tournament ${tournamentId} not found`);
    }
}