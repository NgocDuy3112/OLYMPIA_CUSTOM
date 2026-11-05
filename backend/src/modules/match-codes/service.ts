// A ROOM code — the walk-in's half of an entrance.
//
// It answers ONE question: WHICH ROOM is open. It never says who is typing it —
// the account is the only identity, and a claim needs a session AND this row.
// This is the inversion of the PIN door deleted in step 5, which minted a
// session FROM the code (code as identity): here the claim runs authenticated,
// and the code buys a seat and nothing else.
//
// The table started with a second secret (a one-time ENTRY code bound to one
// account — the forgotten-password path). Step 8 removed it: the desk now
// issues passwords itself and forces the player to change the first one, so a
// forgotten password is a reset at the roster, not a code to hand out.
import { randomInt } from "node:crypto";
import { and, eq, gt, isNull, ne } from "drizzle-orm";
import { db } from "../../db/pool.js";
import { matchCodes, matches, tournaments } from "../../db/schema/index.js";
import { allowedSeatCounts, type Seat } from "../../game/contracts/index.js";
import { CodeError } from "./errors.js";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** A room code lives a day: long enough for the show, short enough that a leaked one dies. */
const ROOM_CODE_TTL_MS = 24 * 60 * 60 * 1000;

// No I, L, O, 0, 1: the desk reads this code aloud across a noisy floor, and a
// character nobody can mistake is worth more than one extra bit of entropy.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;
const MAX_MINT_TRIES = 5;

/** What a player types: case and stray spaces are theirs to get wrong. */
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

/** Mint a code, retrying the astronomically unlikely collision on the unique key. */
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

// ── the room code ────────────────────────────────────────────────────────────

export interface RoomCode {
    matchId: string;
    code: string;
    expiresAt: Date;
}

/**
 * Mint the room code of a match — creating it, or ROTATING it: the old code is
 * deleted in the same transaction, so a leaked code stops working immediately
 * instead of at some expiry. Seats and accounts are untouched by a rotation;
 * that is the point of keeping the code out of the `matches` row.
 */
export async function rotateRoomCode(
    tournamentId: string,
    matchId: string,
    createdBy: string
): Promise<RoomCode> {
    return db.transaction(async (tx) => {
        // One live code per match, even when two operators click at once: the
        // lock serialises rotations the same way claims serialise seating.
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

        // The old codes die only once the new one exists: a failed mint leaves
        // the previous door standing rather than locking everybody out.
        await tx
            .delete(matchCodes)
            .where(and(
                eq(matchCodes.matchId, matchId),
                ne(matchCodes.id, row.id)
            ));

        return { matchId, code: row.code, expiresAt: row.expiresAt };
    });
}

/** Every live room code of a tournament — one read for the whole matches tab. */
export async function activeRoomCodes(tournamentId: string): Promise<RoomCode[]> {
    // `matches.id` (not matchCodes.match_id) so the join's own guarantee — the
    // row names a match — is what the type says, without a cast.
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

/**
 * Session + room code + a free seat → the player is seated, on the spot.
 *
 * The code is the permission (no approval queue) and capacity is the real
 * check: a match holds one of the format's seat counts, so a full table
 * answers 409. The seat write runs in one transaction behind `FOR UPDATE`, so
 * two walk-ins racing for the last seat cannot both win — the second waits,
 * sees the table full, and gets the same 409 a sequential caller would.
 *
 * No roster check on purpose: the approved shape is that a player the desk
 * never pre-seated still walks straight in, and `GET /gameplay/me/match` reads
 * the seat, not the roster.
 */
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

    // Unknown or expired — one answer, so a probe learns nothing.
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

    // The format's largest allowed count: 3-or-4 tables hold four, fixed tables
    // hold what they say. A match already at that count is FULL.
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
        // Already seated: the claim is idempotent, so a repeated tap is not an error.
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
