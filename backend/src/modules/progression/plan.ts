// The tournament rulebook, as pure functions. No I/O, no randomness of its own: callers
// inject an rng, so draws are reproducible in tests (and can be logged in production).
//
// Ties are broken differently per phase:
//   - Phase 1 (qualification) uses a SECOND point system, not a tie-break turn.
//     See `qualification.ts`.
//   - Phase 2 onward (splitting re-rank, the ladder, the finale) uses a TIE-BREAK TURN:
//     the tied players play one ve-dich Phase 1 turn, and those points only order them —
//     the tie-break never changes anyone's match score. See `needsTiebreak` below.
//
// Phase progression: qualification -> splitting (x splittingRounds) -> ladder -> finale.
import type { Progression } from "../../game/contracts/index.js";
import { assertValidProgression, ProgressionError } from "../../game/contracts/index.js";

export type Rng = () => number;

// ── Splitting: rank tiers and the draw ────────────────────────────────────────

// Contiguous blocks of `groupSize` by rank: S = 1..4, A = 5..8, B = 9..12, C = 13..16.
export function tiersFor(ranked: string[], groupSize: number): string[][] {
    if (ranked.length !== groupSize ** 2) {
        throw new ProgressionError(
            `expected ${groupSize ** 2} players for the draw, got ${ranked.length}`
        );
    }
    const tiers: string[][] = [];
    for (let i = 0; i < ranked.length; i += groupSize) {
        tiers.push(ranked.slice(i, i + groupSize));
    }
    return tiers;
}

function shuffle<T>(items: T[], rng: Rng): T[] {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}

// One player from each tier per match. Every match therefore has exactly one S, A, B and C
// (for the canonical 16/4 case).
export function drawGroups(ranked: string[], groupSize: number, rng: Rng): string[][] {
    const tiers = tiersFor(ranked, groupSize).map((tier) => shuffle(tier, rng));
    const matchCount = groupSize;          // 16 / 4 = 4 matches
    const groups: string[][] = [];
    for (let match = 0; match < matchCount; match++) {
        groups.push(tiers.map((tier) => tier[match]));
    }
    return groups;
}

// ── Phase 2 ranking ───────────────────────────────────────────────────────────

// Round 2 decides; round 1 breaks the tie. Ties beyond that keep the input order, so the
// result is deterministic.
export function rankPhase2(
    round1: Record<string, number>,
    round2: Record<string, number>
): string[] {
    const ids = [...new Set([...Object.keys(round1), ...Object.keys(round2)])];
    return ids.sort((a, b) => {
        const r2 = (round2[b] ?? 0) - (round2[a] ?? 0);
        if (r2 !== 0) return r2;
        const r1 = (round1[b] ?? 0) - (round1[a] ?? 0);
        return r1;
    });
}

// ── The ladder ────────────────────────────────────────────────────────────────

export interface LadderMatch {
    slot: number;        // 1 = the highest match
    order: string[];     // best first: order[0] is the winner
}

export interface LadderRound {
    matches: LadderMatch[];   // contiguous slots from 1
}

export interface LadderStep {
    toFinale: string;            // winner of slot 1
    eliminated: string[];        // the last slot's losers, in their match order
    next: LadderRound;           // one fewer match; empty when the ladder is done
    done: boolean;
}

// Winner of each match moves up one slot; the other three move down one. The top winner
// goes to the finale; the bottom three are eliminated.
export function ladderNext(round: LadderRound): LadderStep {
    if (round.matches.length === 0) {
        throw new ProgressionError("ladder round has no matches");
    }

    const sorted = [...round.matches].sort((a, b) => a.slot - b.slot);
    const toFinale = sorted[0].order[0];
    const last = sorted[sorted.length - 1];
    const eliminated = last.order.slice(1);

    const matches: LadderMatch[] = [];
    for (let i = 0; i < sorted.length - 1; i++) {
        const upper = sorted[i];        // its losers drop into the next slot
        const lower = sorted[i + 1];    // its winner climbs into this slot
        matches.push({
            slot: i + 1,
            order: [lower.order[0], ...upper.order.slice(1)]
        });
    }

    return { toFinale, eliminated, next: { matches }, done: matches.length === 0 };
}

// The first ladder round: rank blocks of `groupSize`, seeded in rank order.
export function initialLadder(ranked: string[], groupSize: number): LadderRound {
    const matches: LadderMatch[] = [];
    for (let i = 0; i < ranked.length; i += groupSize) {
        matches.push({ slot: i / groupSize + 1, order: ranked.slice(i, i + groupSize) });
    }
    return { matches };
}

// ── Final placements ──────────────────────────────────────────────────────────

export interface EliminationWave {
    players: string[];   // ordered by their score in the match they lost
}

// Places 1..finaleSize come from the finale; then waves, latest first (later elimination
// places better), each wave in its own order.
export function finalPlacements(params: {
    finaleOrder: string[];
    waves: EliminationWave[];      // earliest first, as the ladder produced them
}): Array<{ playerId: string; place: number }> {
    const rows: Array<{ playerId: string; place: number }> = [];
    let place = 1;

    for (const playerId of params.finaleOrder) {
        rows.push({ playerId, place: place++ });
    }
    for (const wave of [...params.waves].reverse()) {
        for (const playerId of wave.players) {
            rows.push({ playerId, place: place++ });
        }
    }
    return rows;
}

// ── Ties ──────────────────────────────────────────────────────────────────────

// Phase 2 onward: does the top score belong to more than one player? The ladder cannot
// promote without a single winner, so this is what triggers a tie-break turn. Phase 1
// does not use this — it has a second point system instead.
export function needsTiebreak(scores: Array<{ playerId: string; score: number }>): string[] {
    if (scores.length === 0) return [];
    const top = Math.max(...scores.map((s) => s.score));
    return scores.filter((s) => s.score === top).map((s) => s.playerId);
}

// Order tied players by their tie-break scores; a remaining tie keeps input order.
export function orderByTiebreak(
    tied: string[],
    tiebreakScores: Record<string, number>
): string[] {
    return [...tied].sort((a, b) => (tiebreakScores[b] ?? 0) - (tiebreakScores[a] ?? 0));
}

export { assertValidProgression, ProgressionError };
