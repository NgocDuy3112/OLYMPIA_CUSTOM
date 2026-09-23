import { and, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { db, matches, questionBank, questions } from "@oc/db";

export type BankStatus = "pending" | "approved" | "rejected";

export interface BankRow {
    id: string;
    bankCode: string;
    content: string;
    answer: string;
    explanation: string | null;
    hintText: string | null;
    mediaUrl: string | null;
    options: string | null;
    roundHint: string | null;
    domain: string | null;
    difficulty: number | null;
    setCode: string | null;
    hintIndex: string | null;
    status: BankStatus;
    reviewNote: string | null;
    reviewedBy: string | null;
    createdBy: string | null;
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
    roundHint?: string;
    roundHints?: string[];
    domain?: string;
    difficulty?: number;
    setCode?: string;
    status?: string;
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
    update(
        id: string,
        updates: {
            content?: string | null;
            answer?: string | null;
            explanation?: string | null;
            hintText?: string | null;
            mediaUrl?: string | null;
            options?: string | null;
            roundHint?: string | null;
            domain?: string | null;
            difficulty?: number | null;
            setCode?: string | null;
            hintIndex?: string | null;
        },
    ): Promise<boolean>;
    softDelete(id: string): Promise<boolean>;
    review(
        id: string,
        input: { status: BankStatus; reviewNote?: string | null; reviewedBy?: string | null },
    ): Promise<boolean>;
    create(input: {
        bankCode: string;
        content: string;
        answer: string;
        explanation?: string | null;
        hintText?: string | null;
        mediaUrl?: string | null;
        options?: string | null;
        roundHint?: string | null;
        domain?: string | null;
        difficulty?: number | null;
        setCode?: string | null;
        hintIndex?: string | null;
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
        roundHint: r.roundHint,
        domain: r.domain,
        difficulty: r.difficulty,
        setCode: r.setCode,
        hintIndex: r.hintIndex,
        status: (r.status ?? "pending") as BankStatus,
        reviewNote: r.reviewNote,
        reviewedBy: r.reviewedBy,
        createdBy: r.createdBy,
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
            ) as SQL,
        );
    }
    if (params.roundHint?.trim()) {
        conds.push(eq(questionBank.roundHint, params.roundHint.trim()));
    }
    const hints = (params.roundHints ?? []).map((h) => h.trim()).filter(Boolean);
    if (hints.length > 0) {
        conds.push(inArray(questionBank.roundHint, hints));
    }
    if (params.domain?.trim()) {
        conds.push(eq(questionBank.domain, params.domain.trim().toUpperCase()));
    }
    if (params.difficulty !== undefined && params.difficulty !== null) {
        conds.push(eq(questionBank.difficulty, params.difficulty));
    }
    if (params.setCode?.trim()) {
        conds.push(eq(questionBank.setCode, params.setCode.trim()));
    }
    const status = params.status?.trim().toLowerCase();
    if (status === "pending" || status === "approved" || status === "rejected") {
        conds.push(eq(questionBank.status, status));
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
                roundHint: input.roundHint ?? null,
                domain: input.domain ?? null,
                difficulty: input.difficulty ?? null,
                setCode: input.setCode ?? null,
                hintIndex: input.hintIndex ?? null,
                createdBy: input.createdBy ?? null,
                status: "pending",
            })
            .returning({ id: questionBank.id });
        return result[0];
    },

    async update(id, updates): Promise<boolean> {
        const values: Record<string, unknown> = {};
        if (updates.content !== undefined) values.content = updates.content;
        if (updates.answer !== undefined) values.answer = updates.answer;
        if (updates.explanation !== undefined)
            values.explanation = updates.explanation;
        if (updates.hintText !== undefined) values.hintText = updates.hintText;
        if (updates.mediaUrl !== undefined) values.mediaUrl = updates.mediaUrl;
        if (updates.options !== undefined) values.options = updates.options;
        if (updates.roundHint !== undefined) values.roundHint = updates.roundHint;
        if (updates.domain !== undefined) values.domain = updates.domain;
        if (updates.difficulty !== undefined) values.difficulty = updates.difficulty;
        if (updates.setCode !== undefined) values.setCode = updates.setCode;
        if (updates.hintIndex !== undefined) values.hintIndex = updates.hintIndex;
        if (Object.keys(values).length === 0) return false;
        const result = await db
            .update(questionBank)
            .set(values)
            .where(
                and(eq(questionBank.id, id), eq(questionBank.isDeleted, false)),
            )
            .returning({ id: questionBank.id });
        return result.length > 0;
    },

    async review(id, input): Promise<boolean> {
        const result = await db
            .update(questionBank)
            .set({
                status: input.status,
                reviewNote: input.reviewNote ?? null,
                reviewedBy: input.reviewedBy ?? null,
                reviewedAt: new Date(),
            })
            .where(
                and(eq(questionBank.id, id), eq(questionBank.isDeleted, false)),
            )
            .returning({ id: questionBank.id });
        return result.length > 0;
    },

    async softDelete(id): Promise<boolean> {
        const result = await db
            .update(questionBank)
            .set({ isDeleted: true })
            .where(
                and(eq(questionBank.id, id), eq(questionBank.isDeleted, false)),
            )
            .returning({ id: questionBank.id });
        return result.length > 0;
    },
};

export function createInMemoryBankRepo(seed: BankRow[] = []): BankRepo & { rows: BankRow[] } {
    const rows = [...seed];
    const matchesStatus = (r: BankRow, status?: string): boolean => {
        const s = status?.trim().toLowerCase();
        if (s === "pending" || s === "approved" || s === "rejected") return r.status === s;
        return true;
    };
    const searchRows = (params: BankSearchParams): BankRow[] => {
        const q = params.q?.trim().toLowerCase() ?? "";
        const roundHint = params.roundHint?.trim() ?? "";
        const limit = Math.min(Math.max(params.limit ?? 50, 1), 100);
        const offset = Math.max(params.offset ?? 0, 0);
        let out = [...rows];
        if (q) {
            out = out.filter((r) =>
                `${r.bankCode} ${r.content} ${r.answer}`
                    .toLowerCase()
                    .includes(q),
            );
        }
        if (roundHint) {
            out = out.filter((r) => r.roundHint === roundHint);
        }
        const hints = (params.roundHints ?? []).map((h) => h.trim()).filter(Boolean);
        if (hints.length > 0) {
            out = out.filter((r) => r.roundHint !== null && hints.includes(r.roundHint));
        }
        if (params.domain?.trim()) {
            out = out.filter((r) => r.domain === params.domain!.trim().toUpperCase());
        }
        if (params.difficulty !== undefined && params.difficulty !== null) {
            out = out.filter((r) => r.difficulty === params.difficulty);
        }
        if (params.setCode?.trim()) {
            out = out.filter((r) => r.setCode === params.setCode!.trim());
        }
        out = out.filter((r) => matchesStatus(r, params.status));
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
            const roundHint = params.roundHint?.trim() ?? "";
            let out = [...rows];
            if (q) {
                out = out.filter((r) =>
                    `${r.bankCode} ${r.content} ${r.answer}`
                        .toLowerCase()
                        .includes(q),
                );
            }
            if (roundHint) {
                out = out.filter((r) => r.roundHint === roundHint);
            }
            const hints = (params.roundHints ?? []).map((h) => h.trim()).filter(Boolean);
            if (hints.length > 0) {
                out = out.filter((r) => r.roundHint !== null && hints.includes(r.roundHint));
            }
            if (params.domain?.trim()) {
                out = out.filter((r) => r.domain === params.domain!.trim().toUpperCase());
            }
            if (params.difficulty !== undefined && params.difficulty !== null) {
                out = out.filter((r) => r.difficulty === params.difficulty);
            }
            if (params.setCode?.trim()) {
                out = out.filter((r) => r.setCode === params.setCode!.trim());
            }
            out = out.filter((r) => matchesStatus(r, params.status));
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
                roundHint: input.roundHint ?? null,
                domain: input.domain ?? null,
                difficulty: input.difficulty ?? null,
                setCode: input.setCode ?? null,
                hintIndex: input.hintIndex ?? null,
                status: "pending",
                reviewNote: null,
                reviewedBy: null,
                createdBy: input.createdBy ?? null,
            };
            rows.push(row);
            return { id: row.id };
        },
        async update(id, updates) {
            const row = rows.find((r) => r.id === id);
            if (!row) return false;
            Object.assign(row, updates);
            return true;
        },
        async review(id, input) {
            const row = rows.find((r) => r.id === id);
            if (!row) return false;
            row.status = input.status;
            row.reviewNote = input.reviewNote ?? null;
            row.reviewedBy = input.reviewedBy ?? null;
            return true;
        },
        async softDelete(id) {
            const idx = rows.findIndex((r) => r.id === id);
            if (idx < 0) return false;
            rows.splice(idx, 1);
            return true;
        },
    };
}
