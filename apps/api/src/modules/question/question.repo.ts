import { and, eq } from "drizzle-orm";
import { db, matches, questions, tournamentPlayers } from "@oc/db";

export interface QuestionRow {
    id: string;
    questionCode: string;
    content: string;
    answer: string;
    explanation: string | null;
    mediaUrl: string | null;
    options: string | null;
    matchId: string;
    isUsed: boolean;
    sourceBankId: string | null;
}

export interface QuestionRepo {
    listByMatchId(matchId: string): Promise<QuestionRow[]>;
    findByCode(matchId: string, questionCode: string): Promise<QuestionRow | null>;
    create(input: {
        matchId: string;
        questionCode: string;
        content: string;
        answer: string;
        explanation?: string;
        mediaUrl?: string | null;
        options?: string | null;
        sourceBankId?: string | null;
    }): Promise<{ id: string }>;
    update(
        matchId: string,
        questionCode: string,
        updates: {
            content?: string | null;
            answer?: string | null;
            explanation?: string | null;
            mediaUrl?: string | null;
            options?: string | string[] | null;
        },
    ): Promise<{ id: string } | null>;
    softDeleteAll(matchId: string): Promise<void>;
    softDeleteOne(matchId: string, questionCode: string): Promise<boolean>;
    markUsed(matchId: string, questionCode: string): Promise<boolean>;
    findByCodeGlobal(questionCode: string): Promise<{ id: string } | null>;
    findTournamentRole(
        userId: string,
        matchId: string,
    ): Promise<string | null>;
}

export const drizzleQuestionRepo: QuestionRepo = {
    async listByMatchId(matchId: string): Promise<QuestionRow[]> {
        const rows = await db
            .select()
            .from(questions)
            .where(
                and(eq(questions.matchId, matchId), eq(questions.isDeleted, false)),
            );
        return rows as QuestionRow[];
    },

    async findByCode(
        matchId: string,
        questionCode: string,
    ): Promise<QuestionRow | null> {
        const rows = await db
            .select()
            .from(questions)
            .where(
                and(
                    eq(questions.matchId, matchId),
                    eq(questions.questionCode, questionCode),
                    eq(questions.isDeleted, false),
                ),
            )
            .limit(1);
        return (rows[0] as QuestionRow | undefined) ?? null;
    },

    async create(input: {
        matchId: string;
        questionCode: string;
        content: string;
        answer: string;
        explanation?: string;
        mediaUrl?: string | null;
        options?: string | null;
        sourceBankId?: string | null;
    }): Promise<{ id: string }> {
        const result = await db
            .insert(questions)
            .values({
                matchId: input.matchId,
                questionCode: input.questionCode,
                content: input.content,
                answer: input.answer,
                explanation: input.explanation,
                mediaUrl: input.mediaUrl,
                options: input.options,
                sourceBankId: input.sourceBankId ?? null,
            })
            .returning({ id: questions.id });
        return result[0];
    },

    async update(
        matchId: string,
        questionCode: string,
        updates: {
            content?: string | null;
            answer?: string | null;
            explanation?: string | null;
            mediaUrl?: string | null;
            options?: string | string[] | null;
        },
    ): Promise<{ id: string } | null> {
        const values: Record<string, unknown> = { updatedAt: new Date() };
        if (updates.content !== undefined) values.content = updates.content;
        if (updates.answer !== undefined) values.answer = updates.answer;
        if (updates.explanation !== undefined)
            values.explanation = updates.explanation;
        if (updates.mediaUrl !== undefined) values.mediaUrl = updates.mediaUrl;
        if (updates.options !== undefined)
            values.options = Array.isArray(updates.options)
                ? JSON.stringify(updates.options)
                : updates.options;
        if (Object.keys(values).length <= 1) return null;
        const result = await db
            .update(questions)
            .set(values)
            .where(
                and(
                    eq(questions.matchId, matchId),
                    eq(questions.questionCode, questionCode),
                    eq(questions.isDeleted, false),
                ),
            )
            .returning({ id: questions.id });
        return result[0] ?? null;
    },

    async softDeleteAll(matchId: string): Promise<void> {
        await db
            .update(questions)
            .set({ isDeleted: true, updatedAt: new Date() })
            .where(
                and(eq(questions.matchId, matchId), eq(questions.isDeleted, false)),
            );
    },

    async softDeleteOne(
        matchId: string,
        questionCode: string,
    ): Promise<boolean> {
        const result = await db
            .update(questions)
            .set({ isDeleted: true, updatedAt: new Date() })
            .where(
                and(
                    eq(questions.matchId, matchId),
                    eq(questions.questionCode, questionCode),
                    eq(questions.isDeleted, false),
                ),
            )
            .returning({ id: questions.id });
        return result.length > 0;
    },

    async markUsed(matchId: string, questionCode: string): Promise<boolean> {
        const result = await db
            .update(questions)
            .set({ isUsed: true, updatedAt: new Date() })
            .where(
                and(
                    eq(questions.matchId, matchId),
                    eq(questions.questionCode, questionCode),
                    eq(questions.isDeleted, false),
                ),
            )
            .returning({ id: questions.id });
        return result.length > 0;
    },

    async findByCodeGlobal(
        questionCode: string,
    ): Promise<{ id: string } | null> {
        const rows = await db
            .select({ id: questions.id })
            .from(questions)
            .where(
                and(
                    eq(questions.questionCode, questionCode),
                    eq(questions.isDeleted, false),
                ),
            )
            .limit(1);
        return rows[0] ?? null;
    },

    async findTournamentRole(
        userId: string,
        matchId: string,
    ): Promise<string | null> {
        const matchRows = await db
            .select({ tournamentId: matches.tournamentId })
            .from(matches)
            .where(eq(matches.id, matchId))
            .limit(1);
        const tournamentId = matchRows[0]?.tournamentId;
        if (!tournamentId) return null;
        const membership = await db
            .select({ role: tournamentPlayers.role })
            .from(tournamentPlayers)
            .where(
                and(
                    eq(tournamentPlayers.tournamentId, tournamentId),
                    eq(tournamentPlayers.playerId, userId),
                ),
            )
            .limit(1);
        return membership[0]?.role ?? null;
    },
};

export function createInMemoryQuestionRepo(
    seed: QuestionRow[] = [],
): QuestionRepo & { rows: QuestionRow[] } {
    const rows = [...seed];
    return {
        rows,
        async listByMatchId(matchId) {
            return rows.filter((r) => r.matchId === matchId);
        },
        async findByCode(matchId, questionCode) {
            return (
                rows.find(
                    (r) => r.matchId === matchId && r.questionCode === questionCode,
                ) ?? null
            );
        },
        async create(input) {
            const row: QuestionRow = {
                id: `mem-${rows.length + 1}`,
                matchId: input.matchId,
                questionCode: input.questionCode,
                content: input.content,
                answer: input.answer,
                explanation: input.explanation ?? null,
                mediaUrl: input.mediaUrl ?? null,
                options: input.options ?? null,
                isUsed: false,
                sourceBankId: null,
            };
            rows.push(row);
            return { id: row.id };
        },
        async update(matchId, questionCode, updates) {
            const row = rows.find(
                (r) => r.matchId === matchId && r.questionCode === questionCode,
            );
            if (!row) return null;
            if (updates.content !== undefined)
                row.content = updates.content ?? row.content;
            if (updates.answer !== undefined)
                row.answer = updates.answer ?? row.answer;
            return { id: row.id };
        },
        async softDeleteAll(matchId) {
            for (let i = rows.length - 1; i >= 0; i--) {
                if (rows[i].matchId === matchId) rows.splice(i, 1);
            }
        },
        async softDeleteOne(matchId, questionCode) {
            const idx = rows.findIndex(
                (r) => r.matchId === matchId && r.questionCode === questionCode,
            );
            if (idx < 0) return false;
            rows.splice(idx, 1);
            return true;
        },
        async markUsed(matchId, questionCode) {
            const row = rows.find(
                (r) => r.matchId === matchId && r.questionCode === questionCode,
            );
            if (!row) return false;
            row.isUsed = true;
            return true;
        },
        async findByCodeGlobal(questionCode) {
            const row = rows.find((r) => r.questionCode === questionCode);
            return row ? { id: row.id } : null;
        },
        async findTournamentRole() {
            return "qauthor";
        },
    };
}
