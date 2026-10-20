// Ranking the qualification field (phase 1). Pure: scores in, places out.
//
// Phase 1 does NOT use a tie-break turn. It breaks ties with a SECOND point system, so the
// caller supplies `secondaryScores` per player. Only if both systems agree on a group does
// it need an explicit order (`tieBreaks`), and a group that starts below the cut blocks
// nobody.
import { ProgressionError } from "../../game/contracts/index.js";

export interface QualificationScore {
    userId: string;
    score: number;
}

export interface TieBreak {
    players: string[];
    order: string[];
}

export interface RankedPlayer {
    userId: string;
    score: number;
    rank: number;
}

export interface QualificationOptions {
    // Phase 1 breaks ties with a SECOND point system (e.g. a speed or accuracy score)
    // rather than a tie-break turn. Callers supply it per player; absent means zero.
    secondaryScores?: Record<string, number>;
    // A last resort, for a group the secondary score cannot separate: an explicit order.
    tieBreaks?: TieBreak[];
    // Ties that start below this place cannot change who advances, so they do not block.
    advance?: number;
}

export interface QualificationRanking {
    rows: RankedPlayer[];        // every player, ranked 1..N
    unresolved: string[][];      // tied groups the caller must order
}

// Competition ranking: equal scores share a place unless an explicit order is supplied.
// With an order, the group occupies consecutive places in exactly that order.
//
// `advance` bounds which ties actually matter: a tied group that starts below the cut
// cannot change who advances or the seeding order above it, so it is ordered
// deterministically instead of blocking the close.
export function rankQualification(
    scores: QualificationScore[],
    options: QualificationOptions = {}
): QualificationRanking {
    const secondaryOf = options.secondaryScores ?? {};
    const tieBreaks = options.tieBreaks ?? [];
    const advance = options.advance ?? Number.POSITIVE_INFINITY;

    const secondary = (userId: string) => secondaryOf[userId] ?? 0;

    const scoreOf = new Map(scores.map((s) => [s.userId, s.score]));
    const orderFor = new Map<string, string[]>();

    // Validate the supplied orderings once, up front.
    for (const tieBreak of tieBreaks) {
        if (new Set(tieBreak.players).size !== tieBreak.players.length) {
            throw new ProgressionError("a tie-break lists the same player twice");
        }
        if (tieBreak.order.length !== tieBreak.players.length
            || new Set(tieBreak.order).size !== tieBreak.order.length) {
            throw new ProgressionError("a tie-break order must be a permutation of its players");
        }
        for (const id of tieBreak.players) {
            if (!scoreOf.has(id)) {
                throw new ProgressionError(`tie-break names an unknown player ${id}`);
            }
            if (!tieBreak.order.includes(id)) {
                throw new ProgressionError(`tie-break order omits ${id}`);
            }
        }
        // Players are only "tied" when BOTH point systems agree.
        const keys = new Set(tieBreak.players.map((id) => `${scoreOf.get(id)}|${secondary(id)}`));
        if (keys.size !== 1) {
            throw new ProgressionError("a tie-break group is not actually tied");
        }
        orderFor.set([...tieBreak.players].sort().join("|"), tieBreak.order);
    }

    // Group by (primary, secondary): the secondary point system breaks the primary tie.
    const groups = new Map<string, { score: number; secondary: number; players: string[] }>();
    for (const entry of scores) {
        const key = `${entry.score}|${secondary(entry.userId)}`;
        const group = groups.get(key) ?? { score: entry.score, secondary: secondary(entry.userId), players: [] };
        group.players.push(entry.userId);
        groups.set(key, group);
    }

    const ordered = [...groups.values()].sort(
        (a, b) => b.score - a.score || b.secondary - a.secondary
    );

    const rows: RankedPlayer[] = [];
    const unresolved: string[][] = [];
    let place = 1;

    for (const group of ordered) {
        if (group.players.length === 1) {
            rows.push({ userId: group.players[0], score: group.score, rank: place });
            place += 1;
            continue;
        }

        if (place > advance) {
            // Wholly below the cut: order deterministically, nobody downstream cares.
            for (const userId of group.players) {
                rows.push({ userId, score: group.score, rank: place });
                place += 1;
            }
            continue;
        }

        const order = orderFor.get([...group.players].sort().join("|"));
        if (order === undefined) {
            unresolved.push(group.players);
            continue;
        }

        for (const userId of order) {
            rows.push({ userId, score: group.score, rank: place });
            place += 1;
        }
    }

    return { rows, unresolved };
}

// The players who advance, in rank order.
export function advancing(ranking: QualificationRanking, advance: number): string[] {
    return [...ranking.rows]
        .sort((a, b) => a.rank - b.rank)
        .slice(0, advance)
        .map((row) => row.userId);
}
