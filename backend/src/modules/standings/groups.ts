// The group stage's table — the AOC "Vòng bảng".
//
// Two tables, one source: the roster's groups (tournament_players.group) and the
// FROZEN results of the phase-1/phase-2 matches. The arithmetic is pure and
// lives in engine/scoring/group-stage.ts; this file only feeds it and names the
// people in the result.
//
// Teams are gone (migration 0030): a "team" here is the roster GROUP (Nhóm A /
// Nhóm B), and its points are the sum of what its members banked by finishing
// position. Nothing is stored — a group table is derived on read, so it can
// never drift from the results it is made of.
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../../db/pool.js";
import {
    matchResults,
    matches,
    tournamentPlayers,
    tournaments,
    users
} from "../../db/schema/index.js";
import type { ResultEntry } from "../../game/contracts/index.js";
import {
    buildGroupStandings,
    phaseOfStage,
    type Averages,
    type GroupLabel,
    type GroupMatchInput
} from "../../game/engine/scoring/group-stage.js";

/** One contestant's line in their group (or in the wildcard table). */
export interface GroupRow {
    userId: string;
    displayName: string;
    matchesPlayed: number;
    /** Σ team points this contestant banked for their group. */
    bankedPoints: number;
    averages: Averages;
}

export interface GroupBlock {
    id: GroupLabel;
    /** Σ of the members' banked points — the group's own score. */
    teamPoints: number;
    rows: GroupRow[];
}

export interface GroupTables {
    /** The two groups, in label order. Rows are rank-ordered (see the engine). */
    groups: GroupBlock[];
    /** Enrolled players with no group yet — the operator still has to place them. */
    unassigned: Array<{ userId: string; displayName: string }>;
    /** The wildcard leaderboard: every contestant with ≥ 1 match, best avg first. */
    wildcard: Array<GroupRow & { avg: number }>;
}

/** Enrolled players, with the group they bank for (null = not drawn yet). */
async function rosterWithGroups(tournamentId: string): Promise<Array<{
    userId: string;
    displayName: string;
    group: GroupLabel | null;
}>> {
    return db
        .select({
            userId: tournamentPlayers.userId,
            displayName: users.displayName,
            group: tournamentPlayers.group
        })
        .from(tournamentPlayers)
        .innerJoin(users, eq(users.id, tournamentPlayers.userId))
        .where(eq(tournamentPlayers.tournamentId, tournamentId))
        .orderBy(asc(tournamentPlayers.enrolledAt));
}

/** The GROUP matches of the tournament, with their frozen results. */
async function groupMatches(tournamentId: string): Promise<GroupMatchInput[]> {
    const stageIds = ["phase-1", "phase-2"];

    const rows = await db
        .select({
            matchId: matches.id,
            stageId: matches.stageId,
            results: matchResults.results
        })
        .from(matches)
        .innerJoin(matchResults, eq(matchResults.matchId, matches.id))
        .where(and(
            eq(matches.tournamentId, tournamentId),
            eq(matches.kind, "STANDARD"),
            inArray(matches.stageId, stageIds),
            isNull(matches.deletedAt)
        ))
        .orderBy(asc(matches.scheduledAt), asc(matches.slot));

    return rows.flatMap((row) => {
        const phase = phaseOfStage(row.stageId);
        if (phase === null) return [];                     // not a group match
        const results = (row.results as ResultEntry[])
            .filter((entry) => entry.kind === "user")
            .map((entry) => ({
                userId: entry.userId,
                rank: entry.rank,
                rawScore: entry.totalScore
            }));
        return results.length > 0 ? [{ phase, results }] : [];
    });
}

/**
 * The group stage as the deck shows it: who is in which Nhóm, what each
 * contestant banked, and who is still to be drawn.
 */
export async function getGroupTables(tournamentId: string): Promise<GroupTables> {
    const [tournament] = await db
        .select({ id: tournaments.id })
        .from(tournaments)
        .where(and(eq(tournaments.id, tournamentId), isNull(tournaments.deletedAt)))
        .limit(1);
    if (!tournament) return { groups: [], unassigned: [], wildcard: [] };

    const roster = await rosterWithGroups(tournamentId);
    const names = new Map(roster.map((row) => [row.userId, row.displayName]));

    // Only drawn contestants take part in the grouping; the rest are the
    // operator's remaining work and are reported as such.
    const drawn = new Map<string, GroupLabel>();
    for (const row of roster) {
        if (row.group) drawn.set(row.userId, row.group);
    }

    const standings = buildGroupStandings(drawn, await groupMatches(tournamentId));
    const lineOf = (row: { userId: string }): string => names.get(row.userId) ?? "Unknown";

    return {
        groups: (["A", "B"] as const).map((id) => ({
            id,
            teamPoints: standings.byGroup[id].teamPoints,
            rows: standings.byGroup[id].contestants.map((line) => ({
                userId: line.userId,
                displayName: lineOf(line),
                matchesPlayed: line.matchesPlayed,
                bankedPoints: line.bankedPoints,
                averages: line.averages
            }))
        })),
        unassigned: roster
            .filter((row) => row.group === null)
            .map((row) => ({ userId: row.userId, displayName: row.displayName })),
        wildcard: standings.wildcard.map((line) => ({
            userId: line.userId,
            displayName: lineOf(line),
            matchesPlayed: line.matchesPlayed,
            bankedPoints: line.bankedPoints,
            averages: line.averages,
            avg: line.avg
        }))
    };
}
