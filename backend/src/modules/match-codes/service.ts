// The two codes, and what each one is FOR.
//
//   · a ROOM code names a match — it answers "which room is open". It is held by
//     the operator, rotatable (leaked → mint a new one) and expiring, and it is
//     only ever HALF of a claim: the session says who the player is, the code
//     says where they may sit. This inverts the PIN deleted in step 5, which
//     minted a session FROM the code — code as identity — and is why a claim
//     here runs authenticated.
//   · an ENTRY code names ONE account, once. It is the desk's answer to a
//     forgotten password: the operator issues it from the roster, the player
//     redeems it for their own session, and the desk never holds a password.
//
// Neither code carries identity. Seats keep referencing `user.id`; accounts stay
// the only thing that says who somebody is.
import { randomInt } from "node:crypto";
import { and, eq, gt, isNotNull, isNull, ne } from "drizzle-orm";
import { db } from "../../db/pool.js";
import { matchCodes, matches, tournaments, users } from "../../db/schema/index.js";
import { allowedSeatCounts, type Seat } from "../../game/contracts/index.js";
import { CodeError } from "./errors.js";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** A room code lives a day: long enough for the show, short enough that a leaked one dies. */
const ROOM_CODE_TTL_MS = 24 * 60 * 60 * 1000;

/** An entry code is handed to a player standing at the desk: minutes, not hours. */
const ENTRY_CODE_TTL_MS = 15 * 60 * 1000;

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
            userId: null,
            expiresAt: new Date(Date.now() + ROOM_CODE_TTL_MS),
            createdBy
        });

        // The old codes die only once the new one exists: a failed mint leaves
        // the previous door standing rather than locking everybody out.
        await tx
            .delete(matchCodes)
            .where(and(
                eq(matchCodes.matchId, matchId),
                ne(matchCodes.id, row.id),
                isNull(matchCodes.usedAt)
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
            isNull(matchCodes.usedAt),
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
            // A room code only: an entry code names a user and is not a door.
            isNotNull(matchCodes.matchId),
            isNull(matchCodes.usedAt),
            gt(matchCodes.expiresAt, new Date())
        ))
        .limit(1);

    // Unknown, expired, or an entry code — one answer, so a probe learns nothing.
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

// ── the one-time entry code ──────────────────────────────────────────────────

/**
 * Issue the desk's password-reset path: a single-use code bound to ONE
 * account. The operator never learns a password — there is none to learn — and
 * the code dies on use or after 15 minutes, whichever comes first.
 *
 * Any earlier live code for the same player is replaced: two live entry codes
 * would be two doors where the desk believes there is one.
 */
export async function issueEntryCode(userId: string, createdBy: string): Promise<{ code: string; expiresAt: Date }> {
    // ONE transaction behind a lock on the account: two desk clerks clicking
    // at once must end with ONE live code, not with each deleting the other's
    // (insert-then-delete interleaved leaves the player with none at all).
    return db.transaction(async (tx) => {
        const [user] = await tx
            .select({ id: users.id, emailVerified: users.emailVerified, disabledAt: users.disabledAt })
            .from(users)
            .where(eq(users.id, userId))
            .for("update")
            .limit(1);

        if (!user) throw new CodeError("NOT_FOUND", "không tìm thấy tài khoản này");
        if (user.disabledAt) throw new CodeError("FORBIDDEN", "tài khoản đã bị khoá");
        // Login refuses an unverified address, and so does redeeming this code:
        // activating the account is the roster's own button, one row above.
        if (!user.emailVerified) {
            throw new CodeError("FORBIDDEN", "tài khoản chưa được xác thực — bấm «Xác thực» trước khi cấp mã");
        }

        // The replacement is minted FIRST: a failed insert must not leave the
        // player with no way in at all.
        const row = await insertCode(tx, {
            userId,
            matchId: null,
            expiresAt: new Date(Date.now() + ENTRY_CODE_TTL_MS),
            createdBy
        });

        await tx
            .delete(matchCodes)
            .where(and(
                eq(matchCodes.userId, userId),
                ne(matchCodes.id, row.id),
                isNull(matchCodes.usedAt)
            ));

        return { code: row.code, expiresAt: row.expiresAt };
    });
}

/**
 * Turn a live entry code into the player's OWN session — the same GAMEPLAY
 * cookie a password login mints, so every seated-player route works unchanged.
 *
 * The consume is a conditional UPDATE, so two simultaneous redemptions cannot
 * both succeed: one wins the row, the other finds it spent and gets the same
 * "not valid" answer an expired code gets.
 */
export async function redeemEntryCode(rawCode: string): Promise<{
    id: string;
    displayName: string;
    role: "ADMIN" | "OPERATOR" | "PLAYER";
    tokenVersion: number;
}> {
    const code = normalizeCode(rawCode);

    const [row] = await db
        .select({ id: matchCodes.id, userId: matchCodes.userId })
        .from(matchCodes)
        .where(and(
            eq(matchCodes.code, code),
            isNotNull(matchCodes.userId),
            isNull(matchCodes.usedAt),
            gt(matchCodes.expiresAt, new Date())
        ))
        .limit(1);

    const invalid = () => new CodeError("NOT_FOUND", "Mã không hợp lệ hoặc đã hết hạn.");
    if (!row?.userId) throw invalid();

    const [user] = await db
        .select({
            id: users.id,
            displayName: users.displayName,
            role: users.role,
            tokenVersion: users.tokenVersion,
            emailVerified: users.emailVerified,
            disabledAt: users.disabledAt
        })
        .from(users)
        .where(eq(users.id, row.userId))
        .limit(1);

    if (!user || user.disabledAt) throw new CodeError("FORBIDDEN", "Tài khoản này không còn dùng được — gặp ban điều hành.");
    if (!user.emailVerified) {
        throw new CodeError("FORBIDDEN", "Tài khoản chưa được xác thực — gặp ban điều hành để kích hoạt.");
    }

    const consumed = await db
        .update(matchCodes)
        .set({ usedAt: new Date() })
        .where(and(eq(matchCodes.id, row.id), isNull(matchCodes.usedAt)))
        .returning({ id: matchCodes.id });
    if (consumed.length === 0) throw invalid();

    return {
        id: user.id,
        displayName: user.displayName,
        role: user.role,
        tokenVersion: user.tokenVersion
    };
}
