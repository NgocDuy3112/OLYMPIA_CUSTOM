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

export interface GroupRow {
    userId: string;
    displayName: string;
    matchesPlayed: number;
    bankedPoints: number;
    averages: Averages;
}

export interface GroupBlock {
    id: GroupLabel;
    teamPoints: number;
    rows: GroupRow[];
}

export interface GroupTables {
    groups: GroupBlock[];
    unassigned: Array<{ userId: string; displayName: string }>;
    wildcard: Array<GroupRow & { avg: number }>;
}

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
        if (phase === null) return [];                     
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

export async function getGroupTables(tournamentId: string): Promise<GroupTables> {
    const [tournament] = await db
        .select({ id: tournaments.id })
        .from(tournaments)
        .where(and(eq(tournaments.id, tournamentId), isNull(tournaments.deletedAt)))
        .limit(1);
    if (!tournament) return { groups: [], unassigned: [], wildcard: [] };

    const roster = await rosterWithGroups(tournamentId);
    const names = new Map(roster.map((row) => [row.userId, row.displayName]));

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
