import type { RoundConfig, TournamentRound } from "../../game/contracts/index.js";
import { isAocRound } from "../../game/engine/aoc-rulebook.js";

/**
 * The rounds a match actually plays, in the tournament's declared order.
 *
 * A round qualifies when the match carries its config OR the AOC rulebook can serve
 * one — the rulebook is the default now, so a match created with `roundConfigs: {}`
 * still plays all four. Filtering on the saved config alone made such a match play
 * NOTHING: an empty round navigator, and no live record to open when it went LIVE.
 * A round the app does not know still needs an explicit config to be played.
 */
export function orderedMatchRounds(
    tournamentRounds: TournamentRound[],
    roundConfigs: Record<string, RoundConfig>
): string[] {
    return [...tournamentRounds]
        .sort((a, b) => a.order - b.order)
        .filter((round) => roundConfigs[round.id] !== undefined || isAocRound(round.id))
        .map((round) => round.id);
}

// The round after `current`, or null when the tournament's rounds are exhausted.
export function nextRoundId(ordered: string[], current: string | null): string | null {
    if (current === null) return ordered[0] ?? null;
    const index = ordered.indexOf(current);
    if (index === -1) return null;
    return ordered[index + 1] ?? null;
}
