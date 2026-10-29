// The saved rules for this tournament's rounds — the only thing a match still
// takes from the rulebook. Question STAGING is gone: matches name their own
// questions at creation (the New-match picker) or stay empty until assembled.
import { tournaments } from "../../db/schema/index.js";
import type { RoundConfig } from "../../game/contracts/index.js";
import { MatchError } from "./errors.js";

type TournamentRow = typeof tournaments.$inferSelect;


// The saved rules for this tournament's rounds. Every match needs them.
export function tournamentRoundConfigs(tournament: TournamentRow): Record<string, RoundConfig> {
    const rules = tournament.roundRules ?? {};

    const missing = tournament.rounds.filter((round) => !rules[round.id]).map((round) => round.id);
    if (missing.length > 0) {
        throw new MatchError(
            "NOT_READY",
            `these rounds have no saved rules for this tournament: ${missing.join(", ")}`,
            missing
        );
    }

    return rules;
}
