import { and, eq, sql } from "drizzle-orm";
import {
    db,
    matches,
    matchPlayerPositions,
    questions,
    records,
    users,
} from "@oc/db";
import { ocPrefixFromCode } from "@oc/shared";

export interface ScoreboardEntry {
    userCode: string;
    userName: string;
    position: number | null;
    score: number;
}

export interface ScoreDeltaInput {
    userCode: string;
    points: number;
}

export interface ScoreRepo {
    scoreboard(matchId: string): Promise<ScoreboardEntry[]>;
    findQuestion(matchId: string, questionCode: string): Promise<{ id: string } | null>;
    insertRecords(
        rows: Array<{
            points: number;
            playerId: string;
            matchId: string;
            questionId: string;
            questionCode: string;
        }>,
    ): Promise<void>;
    totalForPlayer(matchId: string, playerId: string): Promise<number>;
    ensureAdjustQuestion(
        matchId: string,
    ): Promise<{ id: string; questionCode: string }>;
    listPositionCodes(matchId: string): Promise<string[]>;
}

export const drizzleScoreRepo: ScoreRepo = {
    async scoreboard(matchId: string): Promise<ScoreboardEntry[]> {
        const playerRows = await db
            .select({
                userCode: users.userCode,
                userName: users.userName,
                position: matchPlayerPositions.position,
            })
            .from(matchPlayerPositions)
            .innerJoin(users, eq(matchPlayerPositions.playerId, users.id))
            .where(eq(matchPlayerPositions.matchId, matchId))
            .orderBy(matchPlayerPositions.position);
        const scoreRows = await db
            .select({
                userCode: users.userCode,
                totalPoints: sql<number>`COALESCE(SUM(${records.points}), 0)`.as(
                    "total_points",
                ),
            })
            .from(records)
            .innerJoin(users, eq(records.playerId, users.id))
            .where(and(eq(records.matchId, matchId), eq(records.isDeleted, false)))
            .groupBy(users.userCode);
        const scoreMap = new Map(
            scoreRows.map((r) => [r.userCode, Number(r.totalPoints)]),
        );
        const board = playerRows.map((p) => ({
            userCode: p.userCode,
            userName: p.userName,
            position: p.position,
            score: scoreMap.get(p.userCode) ?? 0,
        }));
        board.sort((a, b) => b.score - a.score);
        return board;
    },

    async findQuestion(
        matchId: string,
        questionCode: string,
    ): Promise<{ id: string } | null> {
        const rows = await db
            .select({ id: questions.id })
            .from(questions)
            .where(
                and(
                    eq(questions.matchId, matchId),
                    eq(questions.questionCode, questionCode),
                    eq(questions.isDeleted, false),
                ),
            )
            .limit(1);
        return rows[0] ?? null;
    },

    async insertRecords(
        rows: Array<{
            points: number;
            playerId: string;
            matchId: string;
            questionId: string;
            questionCode: string;
        }>,
    ): Promise<void> {
        if (rows.length === 0) return;
        await db.insert(records).values(rows);
    },

    async totalForPlayer(matchId: string, playerId: string): Promise<number> {
        const rows = await db
            .select({
                total: sql<number>`COALESCE(SUM(${records.points}), 0)`.as("total"),
            })
            .from(records)
            .where(
                and(
                    eq(records.matchId, matchId),
                    eq(records.playerId, playerId),
                    eq(records.isDeleted, false),
                ),
            );
        return Number(rows[0]?.total ?? 0);
    },

    async ensureAdjustQuestion(
        matchId: string,
    ): Promise<{ id: string; questionCode: string }> {
        // Legacy rows used OC3_Q_ADMIN_ADJUST; new rows use the match's OC prefix.
        const matchRows = await db
            .select({ matchCode: matches.matchCode })
            .from(matches)
            .where(eq(matches.id, matchId))
            .limit(1);
        const prefix = ocPrefixFromCode(matchRows[0]?.matchCode);
        const adjustCode = `${prefix}_Q_ADMIN_ADJUST`;
        const rows = await db
            .select({ id: questions.id, questionCode: questions.questionCode })
            .from(questions)
            .where(
                and(
                    eq(questions.matchId, matchId),
                    eq(questions.questionCode, adjustCode),
                ),
            )
            .limit(1);
        if (rows.length > 0) return rows[0];
        // Fallback: reuse legacy OC3 adjust row if present.
        const legacy = await db
            .select({ id: questions.id, questionCode: questions.questionCode })
            .from(questions)
            .where(
                and(
                    eq(questions.matchId, matchId),
                    eq(questions.questionCode, "OC3_Q_ADMIN_ADJUST"),
                ),
            )
            .limit(1);
        if (legacy.length > 0) return legacy[0];
        const inserted = await db
            .insert(questions)
            .values({
                matchId,
                questionCode: adjustCode,
                content: "(Controller score adjustment)",
                answer: "N/A",
            })
            .returning({ id: questions.id, questionCode: questions.questionCode });
        return inserted[0];
    },

    async listPositionCodes(matchId: string): Promise<string[]> {
        const rows = await db
            .select({ userCode: users.userCode })
            .from(matchPlayerPositions)
            .innerJoin(users, eq(matchPlayerPositions.playerId, users.id))
            .where(eq(matchPlayerPositions.matchId, matchId));
        return rows.map((r) => r.userCode);
    },
};

export function createInMemoryScoreRepo(
    seed: ScoreboardEntry[] = [],
): ScoreRepo & { board: ScoreboardEntry[] } {
    const board = [...seed];
    return {
        board,
        async scoreboard() {
            return [...board].sort((a, b) => b.score - a.score);
        },
        async findQuestion() {
            return { id: "mem-question" };
        },
        async insertRecords(rows) {
            for (const row of rows) {
                const entry = board.find((b) => b.userCode === row.playerId);
                if (entry) entry.score += row.points;
            }
        },
        async totalForPlayer(_matchId, playerId) {
            return board.find((b) => b.userCode === playerId)?.score ?? 0;
        },
        async ensureAdjustQuestion() {
            return { id: "mem-adjust", questionCode: "OC3_Q_ADMIN_ADJUST" };
        },
        async listPositionCodes() {
            return board.map((b) => b.userCode);
        },
    };
}

void matches;
