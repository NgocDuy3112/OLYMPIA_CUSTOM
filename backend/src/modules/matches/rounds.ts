import type { RoundConfig, TournamentRound } from "../../game/contracts/index.js";
import { isAocRound } from "../../game/engine/aoc-rulebook.js";

export function orderedMatchRounds(
    tournamentRounds: TournamentRound[],
    roundConfigs: Record<string, RoundConfig>
): string[] {
    return [...tournamentRounds]
        .sort((a, b) => a.order - b.order)
        .filter((round) => roundConfigs[round.id] !== undefined || isAocRound(round.id))
        .map((round) => round.id);
}

export function nextRoundId(ordered: string[], current: string | null): string | null {
    if (current === null) return ordered[0] ?? null;
    const index = ordered.indexOf(current);
    if (index === -1) return null;
    return ordered[index + 1] ?? null;
}
