export type GroupPhase = 1 | 2;

export type GroupLabel = "A" | "B";

const GROUP_STAGE_PHASE: Record<string, GroupPhase> = {
    "phase-1": 1,
    "phase-2": 2
};

export function phaseOfStage(stageId: string): GroupPhase | null {
    return GROUP_STAGE_PHASE[stageId] ?? null;
}


export const GROUP_SEAT_COUNTS = [3, 4] as const;
export type GroupSeatCount = (typeof GROUP_SEAT_COUNTS)[number];

const TEAM_POINTS: Record<GroupPhase, Record<GroupSeatCount, number[]>> = {
    1: { 3: [2], 4: [3, 1] },
    2: { 3: [1], 4: [2] }
};

export function teamPointsFor(phase: GroupPhase, seatCount: number, rank: number): number {
    if (rank < 1) return 0;
    const table = TEAM_POINTS[phase][seatCount as GroupSeatCount];
    if (!table) return 0;
    return table[rank - 1] ?? 0;
}


export function countedScore(phase: GroupPhase, raw: number): number {
    if (phase === 1 && raw < 0) return 0;
    return raw;
}


export interface PlayedMatch {
    phase: GroupPhase;
    rawScore: number;           
}

export interface Averages {
    phase1: number | null;
    phase2: number | null;
    all: number | null;
}

export function averages(matchesPlayed: PlayedMatch[]): Averages {
    const inPhase = (p: GroupPhase) =>
        matchesPlayed.filter((m) => m.phase === p);

    const mean = (ms: PlayedMatch[]): number | null => {
        if (ms.length === 0) return null;
        const total = ms.reduce((sum, m) => sum + countedScore(m.phase, m.rawScore), 0);
        return total / ms.length;
    };

    return {
        phase1: mean(inPhase(1)),
        phase2: mean(inPhase(2)),
        all: mean(matchesPlayed)
    };
}


export interface GroupMatchInput {
    phase: GroupPhase;
    results: Array<{
        userId: string;
        rank: number;           
        rawScore: number;       
    }>;
}

export interface GroupContestantLine {
    userId: string;
    group: GroupLabel;
    matchesPlayed: number;
    bankedPoints: number;       
    averages: Averages;
}

export interface GroupStandings {
    byGroup: Record<GroupLabel, {
        teamPoints: number;     
        contestants: GroupContestantLine[];
    }>;
    wildcard: Array<GroupContestantLine & { avg: number }>;
}

export function buildGroupStandings(
    roster: Map<string, GroupLabel>,          // userId → group
    matches: GroupMatchInput[]
): GroupStandings {
    const perUser = new Map<string, {
        matches: PlayedMatch[];
        banked: number;
    }>();

    for (const match of matches) {
        const seatCount = match.results.length;
        for (const r of match.results) {
            if (!roster.has(r.userId)) continue;
            let entry = perUser.get(r.userId);
            if (!entry) {
                entry = { matches: [], banked: 0 };
                perUser.set(r.userId, entry);
            }
            entry.matches.push({ phase: match.phase, rawScore: r.rawScore });
            entry.banked += teamPointsFor(match.phase, seatCount, r.rank);
        }
    }

    const lines: GroupContestantLine[] = [];
    for (const [userId, group] of roster) {
        const entry = perUser.get(userId);
        lines.push({
            userId,
            group,
            matchesPlayed: entry?.matches.length ?? 0,
            bankedPoints: entry?.banked ?? 0,
            averages: averages(entry?.matches ?? [])
        });
    }

    const byGroup: GroupStandings["byGroup"] = {
        A: { teamPoints: 0, contestants: [] },
        B: { teamPoints: 0, contestants: [] }
    };
    for (const line of lines) {
        const block = byGroup[line.group];
        block.contestants.push(line);
        block.teamPoints += line.bankedPoints;
    }
    for (const g of ["A", "B"] as const) {
        byGroup[g].contestants.sort((a, b) => {
            if (a.matchesPlayed === 0 !== (b.matchesPlayed === 0)) return a.matchesPlayed === 0 ? 1 : -1;
            if (b.bankedPoints !== a.bankedPoints) return b.bankedPoints - a.bankedPoints;
            return (b.averages.all ?? -Infinity) - (a.averages.all ?? -Infinity);
        });
    }

    const wildcard = lines
        .filter((l) => l.matchesPlayed > 0)
        .map((l) => ({ ...l, avg: l.averages.all as number }))
        .sort((a, b) => b.avg - a.avg || b.bankedPoints - a.bankedPoints);

    return { byGroup, wildcard };
}
