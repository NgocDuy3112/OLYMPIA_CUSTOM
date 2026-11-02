// AOC group stage — the team-point accrual, the Phase 1 clamp, and the averages.
//
// Everything here is PURE: frozen match results and the roster go in, standings
// come out. Nothing writes; nothing places a match. The raw score in
// match_results is never touched — Phase 1's floor-at-0 is a COUNTING rule
// applied on read (leaderboard, scoreboard cells), and the match result view
// shows the raw value as played.
//
// A match runs the classic round rulebook and starts from 0 like any other
// match. What the group stage adds on top is the placement → team-point scale:
//
//   Phase 1: 3 seats → 1st banks 2   |  4 seats → 1st banks 3, 2nd banks 1
//   Phase 2: 3 seats → 1st banks 1   |  4 seats → 1st banks 2
//
// Points accrue to the contestant's GROUP (tournament_players.group — Nhóm A /
// Nhóm B), in finishing order. Knockout matches accrue nothing.

export type GroupPhase = 1 | 2;

// Which group a contestant banks for. null = classic format, no groups.
export type GroupLabel = "A" | "B";

// ─── The phase scales ─────────────────────────────────────────────────────────

// How many seats a group-stage match may hold: 3 or 4, staff's call per match.
export const GROUP_SEAT_COUNTS = [3, 4] as const;
export type GroupSeatCount = (typeof GROUP_SEAT_COUNTS)[number];

// teamPoints[phase][seatCount][rank] — rank is 1-based, in finishing order.
// A rank with no entry banks 0 (the rest of the match never accrues).
const TEAM_POINTS: Record<GroupPhase, Record<GroupSeatCount, number[]>> = {
    1: { 3: [2], 4: [3, 1] },
    2: { 3: [1], 4: [2] }
};

// What one placement in one group-stage match is worth to the group.
// rank beyond the table → 0. seatCount not 3 or 4 → 0 (not a group match).
export function teamPointsFor(phase: GroupPhase, seatCount: number, rank: number): number {
    if (rank < 1) return 0;
    const table = TEAM_POINTS[phase][seatCount as GroupSeatCount];
    if (!table) return 0;
    return table[rank - 1] ?? 0;
}

// ─── The Phase 1 clamp ────────────────────────────────────────────────────────

// The counted value: what a result is worth when it is COUNTED toward the
// leaderboard / scoreboard / average. Phase 1 floors at 0; Phase 2 counts raw.
// The raw result itself is never rescored — this is a read-side rule.
export function countedScore(phase: GroupPhase, raw: number): number {
    if (phase === 1 && raw < 0) return 0;
    return raw;
}

// ─── Averages ─────────────────────────────────────────────────────────────────

export interface PlayedMatch {
    phase: GroupPhase;
    rawScore: number;           // the frozen result, exactly as played
}

// One contestant's averages, per the three scopes:
//   avg(phase 1), avg(phase 2) — over the matches played IN that phase;
//   avg(all)                   — over every group match played, phases pooled.
//
// The denominator is ALWAYS the matches the contestant played — never a fixed
// 20; matches not played are skipped, not counted as 0. Each score is counted
// (Phase 1 clamped) before averaging. A contestant with no matches in a scope
// has no average for it (null), which is also why the standings require ≥ 1
// match played to be recognized.
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

// ─── Group standings ──────────────────────────────────────────────────────────

// One finished group-stage match, as the accrual reads it.
export interface GroupMatchInput {
    phase: GroupPhase;
    results: Array<{
        userId: string;
        rank: number;           // 1-based, as frozen in match_results
        rawScore: number;       // the frozen totalScore
    }>;
}

export interface GroupContestantLine {
    userId: string;
    group: GroupLabel;
    matchesPlayed: number;
    bankedPoints: number;       // Σ team points this contestant banked for their group
    averages: Averages;
}

export interface GroupStandings {
    byGroup: Record<GroupLabel, {
        teamPoints: number;     // Σ of the members' banked points
        contestants: GroupContestantLine[];
    }>;
    // Wildcard leaderboard: every contestant across both phases, best first —
    // avg(all) as the primary key, banked points breaking ties.
    wildcard: Array<GroupContestantLine & { avg: number }>;
}

// Build the group standings from the frozen results and the roster's groups.
// Pure derivation: matches not in {1, 2} phases, or contestants without a
// group, are simply not part of the group standings.
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
            // Points accrue in finishing order — each placement banks for its
            // own contestant's group, by the phase's scale.
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
    // Within a group: banked points first, then avg(all) — played ≥ 1 required
    // for recognition (a 0-match contestant sits at the bottom of the group).
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
