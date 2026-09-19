import { and, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { db, matches, questionBank, questions } from "@oc/db";

export interface BankRow {
    id: string;
    bankCode: string;
    content: string;
    answer: string;
    explanation: string | null;
    hintText: string | null;
    mediaUrl: string | null;
    options: string | null;
    tags: string | null;
    roundHint: string | null;
}

export interface BankUsage {
    bankId: string;
    matchCode: string;
    questionCode: string;
    isUsed: boolean;
}

export interface BankRowWithUsage extends BankRow {
    usedCount: number;
    usedIn: BankUsage[];
}

export interface BankSearchParams {
    q?: string;
    tags?: string;
    roundHint?: string;
    limit?: number;
    offset?: number;
}

export interface BankSearchResult<T> {
    rows: T[];
    total: number;
    limit: number;
    offset: number;
}

export interface BankRepo {
    search(params: BankSearchParams): Promise<BankRow[]>;
    searchWithUsage(params: BankSearchParams): Promise<BankRowWithUsage[]>;
    searchPaged(
        params: BankSearchParams,
    ): Promise<BankSearchResult<BankRowWithUsage>>;
    findByCode(bankCode: string): Promise<BankRow | null>;
    findById(id: string): Promise<BankRow | null>;
    create(input: {
        bankCode: string;
        content: string;
        answer: string;
        explanation?: string | null;
        hintText?: string | null;
        mediaUrl?: string | null;
        options?: string | null;
        tags?: string | null;
        roundHint?: string | null;
        createdBy?: string | null;
    }): Promise<{ id: string }>;
}

function toBankRow(r: typeof questionBank.$inferSelect): BankRow {
    return {
        id: r.id,
        bankCode: r.bankCode,
        content: r.content,
        answer: r.answer,
        explanation: r.explanation,
        hintText: r.hintText,
        mediaUrl: r.mediaUrl,
        options: r.options,
        tags: r.tags,
        roundHint: r.roundHint,
    };
}

function buildBankConds(params: BankSearchParams): SQL[] {
    const conds: SQL[] = [eq(questionBank.isDeleted, false)];
    const q = params.q?.trim();
    if (q) {
        const like = `%${q}%`;
        conds.push(
            or(
                ilike(questionBank.bankCode, like),
                ilike(questionBank.content, like),
                ilike(questionBank.answer, like),
                ilike(questionBank.tags, like),
            ) as SQL,
        );
    }
    if (params.tags?.trim()) {
        conds.push(ilike(questionBank.tags, `%${params.tags.trim()}%`));
    }
    if (params.roundHint?.trim()) {
        conds.push(eq(questionBank.roundHint, params.roundHint.trim()));
    }
    return conds;
}

export const drizzleBankRepo: BankRepo = {
    async search(params): Promise<BankRow[]> {
        const limit = Math.min(Math.max(params.limit ?? 50, 1), 100);
        const offset = Math.max(params.offset ?? 0, 0);
        const conds = buildBankConds(params);
        const rows = await db
            .select()
            .from(questionBank)
            .where(and(...conds))
            .orderBy(desc(questionBank.createdAt))
            .limit(limit)
            .offset(offset);
        return rows.map(toBankRow);
    },

    async searchWithUsage(params): Promise<BankRowWithUsage[]> {
        const result = await drizzleBankRepo.searchPaged(params);
        return result.rows;
    },

    async searchPaged(
        params,
    ): Promise<BankSearchResult<BankRowWithUsage>> {
        const limit = Math.min(Math.max(params.limit ?? 20, 1), 100);
        const offset = Math.max(params.offset ?? 0, 0);
        const conds = buildBankConds(params);
        const [totalRows, pageRows] = await Promise.all([
            db
                .select({ count: sql<number>`count(*)`.as("count") })
                .from(questionBank)
                .where(and(...conds)),
            db
                .select()
                .from(questionBank)
                .where(and(...conds))
                .orderBy(desc(questionBank.createdAt))
                .limit(limit)
                .offset(offset),
        ]);
        const rows = pageRows.map(toBankRow);
        if (rows.length === 0) {
            return {
                rows: [],
                total: Number(totalRows[0]?.count ?? 0),
                limit,
                offset,
            };
        }
        const ids = rows.map((r) => r.id);
        const usage = await db
            .select({
                bankId: questions.sourceBankId,
                matchCode: matches.matchCode,
                questionCode: questions.questionCode,
                isUsed: questions.isUsed,
            })
            .from(questions)
            .innerJoin(matches, eq(questions.matchId, matches.id))
            .where(
                and(
                    inArray(questions.sourceBankId, ids),
                    eq(questions.isDeleted, false),
                ),
            );
        const byBank = new Map<string, BankUsage[]>();
        for (const u of usage) {
            if (!u.bankId) continue;
            const list = byBank.get(u.bankId) ?? [];
            list.push({
                bankId: u.bankId,
                matchCode: u.matchCode,
                questionCode: u.questionCode,
                isUsed: u.isUsed ?? false,
            });
            byBank.set(u.bankId, list);
        }
        return {
            rows: rows.map((r) => {
                const usedIn = byBank.get(r.id) ?? [];
                return { ...r, usedCount: usedIn.length, usedIn };
            }),
            total: Number(totalRows[0]?.count ?? 0),
            limit,
            offset,
        };
    },

    async findByCode(bankCode): Promise<BankRow | null> {
        const rows = await db
            .select()
            .from(questionBank)
            .where(
                and(
                    eq(questionBank.bankCode, bankCode),
                    eq(questionBank.isDeleted, false),
                ),
            )
            .limit(1);
        return rows[0] ? toBankRow(rows[0]) : null;
    },

    async findById(id): Promise<BankRow | null> {
        const rows = await db
            .select()
            .from(questionBank)
            .where(
                and(eq(questionBank.id, id), eq(questionBank.isDeleted, false)),
            )
            .limit(1);
        return rows[0] ? toBankRow(rows[0]) : null;
    },

    async create(input): Promise<{ id: string }> {
        const result = await db
            .insert(questionBank)
            .values({
                bankCode: input.bankCode,
                content: input.content,
                answer: input.answer,
                explanation: input.explanation ?? null,
                hintText: input.hintText ?? null,
                mediaUrl: input.mediaUrl ?? null,
                options: input.options ?? null,
                tags: input.tags ?? null,
                roundHint: input.roundHint ?? null,
                createdBy: input.createdBy ?? null,
            })
            .returning({ id: questionBank.id });
        return result[0];
    },
};

export function createInMemoryBankRepo(seed: BankRow[] = []): BankRepo & { rows: BankRow[] } {
    const rows = [...seed];
    const searchRows = (params: BankSearchParams): BankRow[] => {
        const q = params.q?.trim().toLowerCase() ?? "";
        const tags = params.tags?.trim().toLowerCase() ?? "";
        const roundHint = params.roundHint?.trim() ?? "";
        const limit = Math.min(Math.max(params.limit ?? 50, 1), 100);
        const offset = Math.max(params.offset ?? 0, 0);
        let out = [...rows];
        if (q) {
            out = out.filter((r) =>
                `${r.bankCode} ${r.content} ${r.answer} ${r.tags ?? ""}`
                    .toLowerCase()
                    .includes(q),
            );
        }
        if (tags) {
            out = out.filter((r) => (r.tags ?? "").toLowerCase().includes(tags));
        }
        if (roundHint) {
            out = out.filter((r) => r.roundHint === roundHint);
        }
        return out.slice(offset, offset + limit);
    };
    const withUsage = (list: BankRow[]): BankRowWithUsage[] =>
        list.map((r) => ({ ...r, usedCount: 0, usedIn: [] }));
    return {
        rows,
        async search(params) {
            return searchRows(params);
        },
        async searchWithUsage(params) {
            return withUsage(searchRows(params));
        },
        async searchPaged(params) {
            const limit = Math.min(Math.max(params.limit ?? 20, 1), 100);
            const offset = Math.max(params.offset ?? 0, 0);
            const q = params.q?.trim().toLowerCase() ?? "";
            const tags = params.tags?.trim().toLowerCase() ?? "";
            const roundHint = params.roundHint?.trim() ?? "";
            let out = [...rows];
            if (q) {
                out = out.filter((r) =>
                    `${r.bankCode} ${r.content} ${r.answer} ${r.tags ?? ""}`
                        .toLowerCase()
                        .includes(q),
                );
            }
            if (tags) {
                out = out.filter((r) => (r.tags ?? "").toLowerCase().includes(tags));
            }
            if (roundHint) {
                out = out.filter((r) => r.roundHint === roundHint);
            }
            return {
                rows: withUsage(out.slice(offset, offset + limit)),
                total: out.length,
                limit,
                offset,
            };
        },
        async findByCode(bankCode) {
            return rows.find((r) => r.bankCode === bankCode) ?? null;
        },
        async findById(id) {
            return rows.find((r) => r.id === id) ?? null;
        },
        async create(input) {
            const row: BankRow = {
                id: `mem-bank-${rows.length + 1}`,
                bankCode: input.bankCode,
                content: input.content,
                answer: input.answer,
                explanation: input.explanation ?? null,
                hintText: input.hintText ?? null,
                mediaUrl: input.mediaUrl ?? null,
                options: input.options ?? null,
                tags: input.tags ?? null,
                roundHint: input.roundHint ?? null,
            };
            rows.push(row);
            return { id: row.id };
        },
    };
}
