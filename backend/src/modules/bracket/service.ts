// The format, applied to the matches the staff place.
//
// The engine never draws — the staff decide who plays whom — but the engine checks what
// they place against the format, so a bracket that breaks the rules cannot be played:
//
//   splitting — every match takes one player from each tier of the current ranking;
//   playoff   — the winner of a match climbs a slot, the losers drop one;
//   finale    — the four ladder winners.
//
// The rules themselves are pure (`src/game/engine/bracket.ts`); this module only gathers
// the state they need. A stage without a role is not checked: the format is opt-in per
// stage, so a tournament that is not a bracket is left alone.
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
    checked: boolean;      // false when the format cannot be checked yet
    problems: string[];    // what breaks the format, in the staff's language
}

interface PlayedMatch {
    id: string;
    slot: number | null;
    stageId: string;
    order: string[];       // the seats, the winner first
    scores: Map<string, number>;
}

interface StageState {
    id: string;
    role: StageRole | undefined;
}

// The matches of a stage, with the order they were won in.
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
            // the winner first: the rank the result was written in
            order: [...entries]
                .sort((a, b) => a.rank - b.rank)
                .map((entry) => entry.userId!),
            scores
        };
    });
}

// The field's ranking before any match is played: the ENTRY ORDER — the roster as it
// enrolled; stages then refine the order via rankAfter. Ties on enrolled_at fall back
// to the user id so the cut is stable. An empty roster seeds nothing: the check
// reports "cannot check yet".
async function entryRanking(tournamentId: string): Promise<string[] | null> {
    const rows = await db
        .select({ userId: tournamentPlayers.userId })
        .from(tournamentPlayers)
        .where(eq(tournamentPlayers.tournamentId, tournamentId))
        .orderBy(asc(tournamentPlayers.enrolledAt), asc(tournamentPlayers.userId));
    return rows.length > 0 ? rows.map((row) => row.userId) : null;
}

// The ranking after a stage: the stage's scores decide, the previous ranking breaks a tie.
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

    // the players who did not play keep their place at the end
    const idle = previous.filter((userId) => !scores.has(userId));
    return [...playedIds, ...idle];
}

// The name of a player, for the messages.
async function nameOf(userIds: string[]): Promise<Map<string, string>> {
    if (userIds.length === 0) return new Map();
    const rows = await db.select({ id: users.id, displayName: users.displayName })
        .from(users)
        .where(inArray(users.id, userIds));
    return new Map(rows.map((row) => [row.id, row.displayName]));
}

// The number of places the tournament produces: the field that plays the bracket —
// the roster (every player is a competitor).
export async function tournamentPlaces(tournamentId: string): Promise<number> {
    const roster = await db.select({ userId: tournamentPlayers.userId })
        .from(tournamentPlayers)
        .where(eq(tournamentPlayers.tournamentId, tournamentId));
    return roster.length;
}

// Check a match's seats against the format of the stage it belongs to.
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

    // The state before this stage: the ranking (entry order, refined by played stages).
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
                // the first ladder round: the blocks of the ranking
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

        // The tier rule only holds for a square field: the tiers are blocks of the seat
        // count, and a match takes one from each, so a match has field / seats players —
        // which must be the seat count itself.
        if (ranking.length !== tierSize * tierSize) {
            return { checked: false, problems: [] };
        }

        // The tier rule: this match takes one player from each tier of the ranking.
        const problems = tierViolations([params.playerIds], ranking, tierSize);
        return { checked: true, problems };
    }

    if (role === "playoff") {
        const expected = ladderAfter;
        if (!expected) return { checked: false, problems: [] };
        if (params.slot === null) return { checked: false, problems: [] };

        // The ladder rule: this slot's seats are the ones the ladder puts there.
        const wanted = expected.matches.find((match) => match.slot === params.slot);
        if (!wanted) return { checked: false, problems: [] };

        const problems = ladderViolations(
            { matches: [wanted] },
            [{ slot: params.slot, order: params.playerIds }]
        );
        return { checked: true, problems };
    }

    // The finale: the four ladder winners.
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
