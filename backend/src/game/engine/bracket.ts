// The format's rules, as pure functions.
//
// The staff place every match by hand — the engine never draws — but the engine checks
// what they place against the format:
//
//   splitting — the tier draw: the ranking is cut into tiers of `tierSize`, and each
//               match takes one player from each tier.
//   playoff   — the ladder: the winner of a match climbs a slot, the other three drop
//               one; the losers of the bottom match are out.
//   finale    — the four ladder winners, who take the tournament's places 1–4.
//
// Everything here is a total function of its input: no I/O, so the rules are unit
// testable on their own.

export interface RankedPlayer {
    userId: string;
    rank: number;      // 1 = the best
    score: number;
}

// ── Splitting: the tier draw ─────────────────────────────────────────────────

// The ranking cut into contiguous blocks: the tiers.
export function tiersOf(ranked: string[], tierSize: number): string[][] {
    const tiers: string[][] = [];
    for (let i = 0; i < ranked.length; i += tierSize) {
        tiers.push(ranked.slice(i, i + tierSize));
    }
    return tiers;
}

// The tier each player is in, by their position in the ranking.
export function tierOf(ranked: string[], tierSize: number): Map<string, number> {
    const map = new Map<string, number>();
    ranked.forEach((userId, index) => map.set(userId, Math.floor(index / tierSize)));
    return map;
}

// The tier draw: one player from each tier in every match. The players within a tier
// are the staff's to choose.
export function tierDraw(ranked: string[], tierSize: number, matchCount: number): string[][] {
    const tiers = tiersOf(ranked, tierSize);
    const matches: string[][] = [];
    for (let match = 0; match < matchCount; match++) {
        matches.push(tiers.map((tier) => tier[match]).filter((userId) => userId !== undefined));
    }
    return matches;
}

// The violations of the tier rule in a set of matches: a match that seats two players
// from the same tier, or misses a tier.
export function tierViolations(
    matches: string[][],
    ranked: string[],
    tierSize: number
): string[] {
    const tiers = tierOf(ranked, tierSize);
    const tierCount = Math.ceil(ranked.length / tierSize);
    const problems: string[] = [];

    for (const [index, seats] of matches.entries()) {
        const seen = new Map<number, string[]>();
        for (const userId of seats) {
            const tier = tiers.get(userId);
            if (tier === undefined) {
                problems.push(`match ${index + 1}: ${userId} is not in the ranking`);
                continue;
            }
            seen.set(tier, [...(seen.get(tier) ?? []), userId]);
        }
        for (const [tier, players] of seen) {
            if (players.length > 1) {
                problems.push(
                    `match ${index + 1}: ${players.length} players from tier ${tier} (${players.join(", ")})`
                );
            }
        }
        if (seen.size < tierCount) {
            const missing: number[] = [];
            for (let tier = 0; tier < tierCount; tier++) {
                if (!seen.has(tier)) missing.push(tier);
            }
            problems.push(`match ${index + 1}: no player from tier ${missing.join(", ")}`);
        }
    }

    return problems;
}

// ── Playoff: the ladder ──────────────────────────────────────────────────────

export interface LadderMatch {
    slot: number;        // 1 = the highest match
    order: string[];     // best first: order[0] is the winner
}

export interface LadderRound {
    matches: LadderMatch[];   // contiguous slots from 1
}

export interface LadderStep {
    toFinale: string[];        // the winners of the top slots, waiting for the finale
    eliminated: string[];      // the bottom match's losers, in their match order
    next: LadderRound;         // one fewer match
}

// The first round of the ladder: contiguous blocks of `tierSize` in rank order.
export function initialLadder(ranked: string[], tierSize: number): LadderRound {
    const matches: LadderMatch[] = [];
    for (let i = 0; i < ranked.length; i += tierSize) {
        matches.push({ slot: i / tierSize + 1, order: ranked.slice(i, i + tierSize) });
    }
    return { matches };
}

// One round of the ladder: the winner of each match climbs a slot, the other three drop
// one, and the bottom match's losers are out.
export function ladderNext(round: LadderRound, toFinale: string[] = []): LadderStep {
    if (round.matches.length === 0) {
        throw new Error("the ladder round has no matches");
    }

    const sorted = [...round.matches].sort((a, b) => a.slot - b.slot);
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

    return {
        toFinale: [...toFinale, sorted[0].order[0]],
        eliminated,
        next: { matches }
    };
}

// The finale: the ladder winners, in the order they arrived.
export function finaleOrder(toFinale: string[]): string[] {
    return [...toFinale];
}

// The violations of the ladder rule: a match whose seats are not the ones the ladder
// rule puts there.
export function ladderViolations(
    expected: LadderRound,
    actual: Array<{ slot: number; order: string[] }>
): string[] {
    const problems: string[] = [];
    const bySlot = new Map(actual.map((match) => [match.slot, match.order]));

    for (const match of expected.matches) {
        const seats = bySlot.get(match.slot);
        if (!seats) {
            problems.push(`slot ${match.slot}: no match`);
            continue;
        }
        const wanted = match.order;
        if (seats.length !== wanted.length) {
            problems.push(`slot ${match.slot}: ${seats.length} players, the format wants ${wanted.length}`);
            continue;
        }
        const missing = wanted.filter((userId) => !seats.includes(userId));
        if (missing.length > 0) {
            problems.push(`slot ${match.slot}: ${missing.join(", ")} should be in this match`);
        }
    }

    return problems;
}
