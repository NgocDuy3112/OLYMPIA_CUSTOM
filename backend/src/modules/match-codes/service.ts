import { randomInt } from "node:crypto";
import { and, eq, gt, isNull, ne } from "drizzle-orm";
import { db } from "../../db/pool.js";
import { matchCodes, matches, tournaments } from "../../db/schema/index.js";
import { allowedSeatCounts, type Seat } from "../../game/contracts/index.js";
import { CodeError } from "./errors.js";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const ROOM_CODE_TTL_MS = 24 * 60 * 60 * 1000;

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;
const MAX_MINT_TRIES = 5;

function normalizeCode(raw: string): string {
    return raw.trim().toUpperCase();
}

function randomCode(): string {
    let out = "";
    for (let i = 0; i < CODE_LENGTH; i += 1) out += ALPHABET[randomInt(ALPHABET.length)];
    return out;
}

function isUniqueViolation(error: unknown): boolean {
    return typeof error === "object" && error !== null && (error as { code?: string }).code === "23505";
}

async function insertCode(
    executor: typeof db | Tx,
    values: Omit<typeof matchCodes.$inferInsert, "code">
): Promise<typeof matchCodes.$inferSelect> {
    for (let attempt = 0; attempt < MAX_MINT_TRIES; attempt += 1) {
        try {
            const [row] = await executor
                .insert(matchCodes)
                .values({ ...values, code: randomCode() })
                .returning();
            return row!;
        } catch (error) {
            if (!isUniqueViolation(error) || attempt === MAX_MINT_TRIES - 1) throw error;
        }
    }
    throw new Error("could not mint a code");
}


export interface RoomCode {
    matchId: string;
    code: string;
    expiresAt: Date;
}

export async function rotateRoomCode(
    tournamentId: string,
    matchId: string,
    createdBy: string
): Promise<RoomCode> {
    return db.transaction(async (tx) => {
        const [match] = await tx
            .select({ id: matches.id, status: matches.status, deletedAt: matches.deletedAt })
            .from(matches)
            .where(and(eq(matches.id, matchId), eq(matches.tournamentId, tournamentId)))
            .for("update")
            .limit(1);

        if (!match || match.deletedAt) {
            throw new CodeError("NOT_FOUND", "trận này không tồn tại");
        }
        if (match.status === "FINISHED") {
            throw new CodeError("CONFLICT", "trận đã kết thúc — không còn mã vào");
        }

        const row = await insertCode(tx, {
            matchId,
            expiresAt: new Date(Date.now() + ROOM_CODE_TTL_MS),
            createdBy
        });

        await tx
            .delete(matchCodes)
            .where(and(
                eq(matchCodes.matchId, matchId),
                ne(matchCodes.id, row.id)
            ));

        return { matchId, code: row.code, expiresAt: row.expiresAt };
    });
}

export async function activeRoomCodes(tournamentId: string): Promise<RoomCode[]> {
    return db
        .select({ matchId: matches.id, code: matchCodes.code, expiresAt: matchCodes.expiresAt })
        .from(matchCodes)
        .innerJoin(matches, eq(matches.id, matchCodes.matchId))
        .where(and(
            eq(matches.tournamentId, tournamentId),
            isNull(matches.deletedAt),
            ne(matches.status, "FINISHED"),
            gt(matchCodes.expiresAt, new Date())
        ));
}

export interface ClaimResult {
    matchId: string;
    slug: string;
    label: string;
}

export async function claimSeat(userId: string, rawCode: string): Promise<ClaimResult> {
    const code = normalizeCode(rawCode);

    const [row] = await db
        .select({ matchId: matchCodes.matchId })
        .from(matchCodes)
        .where(and(
            eq(matchCodes.code, code),
            gt(matchCodes.expiresAt, new Date())
        ))
        .limit(1);

    if (!row?.matchId) {
        throw new CodeError("NOT_FOUND", "Mã không đúng hoặc đã hết hạn — xin hỏi lại ban điều hành.");
    }
    const matchId = row.matchId;

    const [match] = await db
        .select({ id: matches.id, tournamentId: matches.tournamentId, status: matches.status, label: matches.label, deletedAt: matches.deletedAt })
        .from(matches)
        .where(eq(matches.id, matchId))
        .limit(1);
    if (!match || match.deletedAt) throw new CodeError("NOT_FOUND", "Mã không đúng hoặc đã hết hạn — xin hỏi lại ban điều hành.");
    if (match.status === "FINISHED") throw new CodeError("CONFLICT", "Trận này đã kết thúc.");

    const [tournament] = await db
        .select({ slug: tournaments.slug, format: tournaments.format })
        .from(tournaments)
        .where(eq(tournaments.id, match.tournamentId))
        .limit(1);
    if (!tournament) throw new CodeError("NOT_FOUND", "Mã không đúng hoặc đã hết hạn — xin hỏi lại ban điều hành.");

    const capacity = Math.max(...allowedSeatCounts(tournament.format));

    await db.transaction(async (tx) => {
        const [locked] = await tx
            .select({ id: matches.id, status: matches.status, players: matches.players, deletedAt: matches.deletedAt })
            .from(matches)
            .where(eq(matches.id, matchId))
            .for("update")
            .limit(1);

        if (!locked || locked.deletedAt) {
            throw new CodeError("NOT_FOUND", "Mã không đúng hoặc đã hết hạn — xin hỏi lại ban điều hành.");
        }
        if (locked.status === "FINISHED") throw new CodeError("CONFLICT", "Trận này đã kết thúc.");

        const seats = (locked.players ?? []) as Seat[];
        if (seats.some((seat) => seat.kind === "user" && seat.userId === userId)) return;

        if (seats.length >= capacity) {
            throw new CodeError("CONFLICT", "Trận này đã đủ thí sinh — liên hệ ban điều hành nếu bạn cho là sai.");
        }

        const seed = seats.reduce((highest, seat) => Math.max(highest, seat.seed), 0) + 1;
        const next: Seat[] = [...seats, { kind: "user", userId, seed }];

        await tx
            .update(matches)
            .set({ players: next, updatedAt: new Date() })
            .where(eq(matches.id, matchId));
    });

    return { matchId, slug: tournament.slug, label: match.label };
}
