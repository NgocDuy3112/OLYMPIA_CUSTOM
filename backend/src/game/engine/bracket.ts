export function tiersOf(ranked: string[], tierSize: number): string[][] {
    const tiers: string[][] = [];
    for (let i = 0; i < ranked.length; i += tierSize) {
        tiers.push(ranked.slice(i, i + tierSize));
    }
    return tiers;
}

export function tierOf(ranked: string[], tierSize: number): Map<string, number> {
    const map = new Map<string, number>();
    ranked.forEach((userId, index) => map.set(userId, Math.floor(index / tierSize)));
    return map;
}

export function tierDraw(ranked: string[], tierSize: number, matchCount: number): string[][] {
    const tiers = tiersOf(ranked, tierSize);
    const matches: string[][] = [];
    for (let match = 0; match < matchCount; match++) {
        matches.push(tiers.map((tier) => tier[match]).filter((userId) => userId !== undefined));
    }
    return matches;
}

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


export interface LadderMatch {
    slot: number;        
    order: string[];     
}

export interface LadderRound {
    matches: LadderMatch[];   
}

export interface LadderStep {
    toFinale: string[];        
    eliminated: string[];      
    next: LadderRound;         
}

export function initialLadder(ranked: string[], tierSize: number): LadderRound {
    const matches: LadderMatch[] = [];
    for (let i = 0; i < ranked.length; i += tierSize) {
        matches.push({ slot: i / tierSize + 1, order: ranked.slice(i, i + tierSize) });
    }
    return { matches };
}

export function ladderNext(round: LadderRound, toFinale: string[] = []): LadderStep {
    if (round.matches.length === 0) {
        throw new Error("the ladder round has no matches");
    }

    const sorted = [...round.matches].sort((a, b) => a.slot - b.slot);
    const last = sorted[sorted.length - 1];
    const eliminated = last.order.slice(1);

    const matches: LadderMatch[] = [];
    for (let i = 0; i < sorted.length - 1; i++) {
        const upper = sorted[i];        
        const lower = sorted[i + 1];    
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
