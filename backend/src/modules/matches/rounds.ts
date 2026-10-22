import type { RoundConfig, TournamentRound } from "../../game/contracts/index.js";

// The rounds a match actually plays: those present in the tournament's round list AND in
// the match's roundConfigs, in the tournament's declared order.
export function orderedMatchRounds(
    tournamentRounds: TournamentRound[],
    roundConfigs: Record<string, RoundConfig>
): string[] {
    return [...tournamentRounds]
        .sort((a, b) => a.order - b.order)
        .filter((round) => roundConfigs[round.id] !== undefined)
        .map((round) => round.id);
}

// The round after `current`, or null when the tournament's rounds are exhausted.
export function nextRoundId(ordered: string[], current: string | null): string | null {
    if (current === null) return ordered[0] ?? null;
    const index = ordered.indexOf(current);
    if (index === -1) return null;
    return ordered[index + 1] ?? null;
}
