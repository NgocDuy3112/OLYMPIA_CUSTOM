import { tournaments } from "../../db/schema/index.js";
import type { RoundConfig } from "../../game/contracts/index.js";
import { resolveRoundRules } from "../../game/engine/aoc-rulebook.js";
import { MatchError } from "./errors.js";

type TournamentRow = typeof tournaments.$inferSelect;


export function tournamentRoundConfigs(tournament: TournamentRow): Record<string, RoundConfig> {
    const resolved = resolveRoundRules(tournament.rounds, tournament.roundRules);

    const missing = tournament.rounds.filter((round) => !resolved[round.id]).map((round) => round.id);
    if (missing.length > 0) {
        throw new MatchError(
            "NOT_READY",
            `these rounds are not ones this app can play: ${missing.join(", ")}`,
            missing
        );
    }

    return resolved;
}
