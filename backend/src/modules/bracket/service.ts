import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../../db/pool.js";
import {
    matchResults,
    matches,
    tournamentPlayers,
    tournaments,
    users
} from "../../db/schema/index.js";
import type { ResultEntry, StageRole } from "../../game/contracts/index.js";
import {
    initialLadder,
    ladderNext,
    ladderViolations,
    tierViolations,
    type LadderRound
} from "../../game/engine/bracket.js";

export interface FormatCheck {
    checked: boolean;      
    problems: string[];    
}

interface PlayedMatch {
    id: string;
    slot: number | null;
    stageId: string;
    order: string[];       
    scores: Map<string, number>;
}

interface StageState {
    id: string;
    role: StageRole | undefined;
}

async function playedMatches(tournamentId: string, stageId: string): Promise<PlayedMatch[]> {
    const rows = await db
        .select({
            id: matches.id,
            slot: matches.slot,
            stageId: matches.stageId,
            results: matchResults.results
        })
        .from(matches)
        .innerJoin(matchResults, eq(matchResults.matchId, matches.id))
        .where(and(
            eq(matches.tournamentId, tournamentId),
            eq(matches.stageId, stageId),
            eq(matches.kind, "STANDARD"),
            isNull(matches.deletedAt)
        ))
        .orderBy(asc(matches.slot), asc(matches.id));

    return rows.map((row) => {
        const entries = (row.results as ResultEntry[]).filter(
            (entry) => entry.kind === "user" && entry.userId
        );
        const scores = new Map(entries.map((entry) => [entry.userId!, entry.totalScore]));

        return {
            id: row.id,
            slot: row.slot,
            stageId: row.stageId,
            order: [...entries]
                .sort((a, b) => a.rank - b.rank)
                .map((entry) => entry.userId!),
            scores
        };
    });
}

async function entryRanking(tournamentId: string): Promise<string[] | null> {
    const rows = await db
        .select({ userId: tournamentPlayers.userId })
        .from(tournamentPlayers)
        .where(eq(tournamentPlayers.tournamentId, tournamentId))
        .orderBy(asc(tournamentPlayers.enrolledAt), asc(tournamentPlayers.userId));
    return rows.length > 0 ? rows.map((row) => row.userId) : null;
}

function rankAfter(previous: string[], played: PlayedMatch[]): string[] {
    const scores = new Map<string, number>();
    for (const match of played) {
        for (const [userId, score] of match.scores) {
            scores.set(userId, (scores.get(userId) ?? 0) + score);
        }
    }

    const order = new Map(previous.map((userId, index) => [userId, index]));
    const playedIds = [...scores.keys()].sort((a, b) => {
        const difference = (scores.get(b) ?? 0) - (scores.get(a) ?? 0);
        if (difference !== 0) return difference;
        return (order.get(a) ?? Number.MAX_SAFE_INTEGER) - (order.get(b) ?? Number.MAX_SAFE_INTEGER);
    });

    const idle = previous.filter((userId) => !scores.has(userId));
    return [...playedIds, ...idle];
}

async function nameOf(userIds: string[]): Promise<Map<string, string>> {
    if (userIds.length === 0) return new Map();
    const rows = await db.select({ id: users.id, displayName: users.displayName })
        .from(users)
        .where(inArray(users.id, userIds));
    return new Map(rows.map((row) => [row.id, row.displayName]));
}

export async function tournamentPlaces(tournamentId: string): Promise<number> {
    const roster = await db.select({ userId: tournamentPlayers.userId })
        .from(tournamentPlayers)
        .where(eq(tournamentPlayers.tournamentId, tournamentId));
    return roster.length;
}

export async function checkMatchAgainstFormat(params: {
    tournamentId: string;
    stageId: string;
    slot: number | null;
    playerIds: string[];
}): Promise<FormatCheck> {
    const [tournament] = await db.select().from(tournaments)
        .where(and(eq(tournaments.id, params.tournamentId), isNull(tournaments.deletedAt)))
        .limit(1);
    if (!tournament) return { checked: false, problems: [] };

    const stages: StageState[] = (tournament.stages ?? []).map((stage) => ({
        id: stage.id,
        role: stage.role
    }));

    const index = stages.findIndex((stage) => stage.id === params.stageId);
    if (index < 0) return { checked: false, problems: [] };

    const role = stages[index].role;
    if (!role) return { checked: false, problems: [] };

    const tierSize = tournament.format.competitorsPerMatch;

    let ranking = await entryRanking(params.tournamentId);
    let toFinale: string[] = [];
    let ladderAfter: LadderRound | null = null;

    for (const stage of stages.slice(0, index)) {
        const played = await playedMatches(params.tournamentId, stage.id);

        if (stage.role === "splitting") {
            if (ranking) ranking = rankAfter(ranking, played);
            continue;
        }

        if (stage.role === "playoff") {
            if (ladderAfter === null) {
                ladderAfter = ranking ? initialLadder(ranking, tierSize) : null;
            } else if (played.length > 0) {
                const step = ladderNext({ matches: played.map(toLadderMatch) }, toFinale);
                ladderAfter = step.next;
                toFinale = step.toFinale;
            }
        }
    }

    const names = await nameOf(params.playerIds);

    if (role === "splitting") {
        if (!ranking) return { checked: false, problems: [] };

        if (ranking.length !== tierSize * tierSize) {
            return { checked: false, problems: [] };
        }

        const problems = tierViolations([params.playerIds], ranking, tierSize);
        return { checked: true, problems };
    }

    if (role === "playoff") {
        const expected = ladderAfter;
        if (!expected) return { checked: false, problems: [] };
        if (params.slot === null) return { checked: false, problems: [] };

        const wanted = expected.matches.find((match) => match.slot === params.slot);
        if (!wanted) return { checked: false, problems: [] };

        const problems = ladderViolations(
            { matches: [wanted] },
            [{ slot: params.slot, order: params.playerIds }]
        );
        return { checked: true, problems };
    }

    if (!toFinale.length) return { checked: false, problems: [] };

    const missing = toFinale.filter((userId) => !params.playerIds.includes(userId));
    if (missing.length > 0) {
        const label = await describe(missing, names);
        return { checked: true, problems: [`the finale seats the ladder winners — ${label} are missing`] };
    }
    const extra = params.playerIds.filter((userId) => !toFinale.includes(userId));
    if (extra.length > 0) {
        const label = await describe(extra, names);
        return { checked: true, problems: [`the finale seats the ladder winners — ${label} do not`] };
    }
    return { checked: true, problems: [] };
}

function toLadderMatch(played: PlayedMatch) {
    return { slot: played.slot ?? Number.MAX_SAFE_INTEGER, order: played.order };
}

async function describe(userIds: string[], names: Map<string, string>): Promise<string> {
    return userIds.map((userId) => names.get(userId) ?? userId).join(", ");
}
