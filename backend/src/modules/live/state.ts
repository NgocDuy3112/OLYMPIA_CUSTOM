import { Type, Static } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import type { GiaiMaState } from "../../game/engine/turns/giai-ma.js";
import type { ButPhaState } from "../../game/engine/turns/but-pha.js";
import type { KhoiDongState } from "../../game/engine/turns/khoi-dong-round.js";

// Runtime validation for state loaded from the database. The stored JSON is untrusted:
// it may have been written by an older build. Bad state must fail loudly, never reach
// the engine.

export const GiaiMaPlayerSchema = Type.Object({
    id: Type.String(),
    hintsRevealed: Type.Integer({ minimum: 0 }),
    revealed: Type.Array(Type.String()),
    keywordLocked: Type.Boolean(),
    keywordPoints: Type.Integer(),
    eliminated: Type.Boolean()
});

export const GiaiMaStateSchema = Type.Object({
    stage: Type.Union([Type.Literal("hints"), Type.Literal("ended")]),
    players: Type.Array(GiaiMaPlayerSchema),
    hintIds: Type.Array(Type.String()),
    picked: Type.Array(Type.String()),
    openHint: Type.Union([Type.String(), Type.Null()]),
    openHintAt: Type.Union([Type.String(), Type.Null()])
});

export type GiaiMaStateJson = Static<typeof GiaiMaStateSchema>;

export class LiveStateError extends Error {
    constructor(message: string, public readonly details: string[] = []) {
        super(message);
        this.name = "LiveStateError";
    }
}

export function parseGiaiMaState(raw: unknown): GiaiMaState {
    if (!Value.Check(GiaiMaStateSchema, raw)) {
        const details = Array.from(Value.Errors(GiaiMaStateSchema, raw))
            .slice(0, 5)
            .map((e) => `${e.path || "<root>"}: ${e.message}`);
        throw new LiveStateError("stored live state failed validation", details);
    }
    return raw as GiaiMaState;
}

// ── but-pha ───────────────────────────────────────────────────────────────────

export const ButPhaAnswerSchema = Type.Object({
    playerId: Type.String(),
    correct: Type.Boolean(),
    atS: Type.Number()
});

export const ButPhaStateSchema = Type.Object({
    questionIds: Type.Array(Type.String()),
    cursor: Type.Integer({ minimum: 0 }),
    questionOpenedAt: Type.Union([Type.String(), Type.Null()]),
    answers: Type.Record(Type.String(), Type.Array(ButPhaAnswerSchema)),
    points: Type.Record(Type.String(), Type.Record(Type.String(), Type.Integer())),
    ended: Type.Boolean()
});

export function parseButPhaState(raw: unknown): ButPhaState {
    if (!Value.Check(ButPhaStateSchema, raw)) {
        const details = Array.from(Value.Errors(ButPhaStateSchema, raw))
            .slice(0, 5)
            .map((e) => `${e.path || "<root>"}: ${e.message}`);
        throw new LiveStateError("stored but-pha state failed validation", details);
    }
    return raw as ButPhaState;
}

// ── khoi-dong ─────────────────────────────────────────────────────────────────

export const KhoiDongPhase1RunSchema = Type.Object({
    kind: Type.Literal("phase1"),
    questionIds: Type.Array(Type.String()),
    cursor: Type.Integer({ minimum: 0 }),
    elapsedS: Type.Number(),
    results: Type.Record(
        Type.String(),
        Type.Object({ correct: Type.Boolean(), points: Type.Integer() })
    ),
    ended: Type.Boolean()
});

export const KhoiDongPhase2Schema = Type.Object({
    kind: Type.Literal("phase2"),
    questionIds: Type.Array(Type.String()),
    elapsedS: Type.Number(),
    answers: Type.Record(Type.String(), Type.Record(Type.String(), Type.Boolean())),
    closed: Type.Boolean()
});

export const KhoiDongStateSchema = Type.Object({
    stage: Type.Union([Type.Literal("phase1"), Type.Literal("phase2")]),
    ended: Type.Boolean(),
    order: Type.Array(Type.String()),
    activeIndex: Type.Integer({ minimum: 0 }),
    runs: Type.Record(Type.String(), KhoiDongPhase1RunSchema),
    phase2: Type.Union([KhoiDongPhase2Schema, Type.Null()]),
    phase2OpenedAt: Type.Union([Type.String(), Type.Null()])
});

export function parseKhoiDongState(raw: unknown): KhoiDongState {
    if (!Value.Check(KhoiDongStateSchema, raw)) {
        const details = Array.from(Value.Errors(KhoiDongStateSchema, raw))
            .slice(0, 5)
            .map((e) => `${e.path || "<root>"}: ${e.message}`);
        throw new LiveStateError("stored khoi-dong state failed validation", details);
    }
    return raw as KhoiDongState;
}

// Parse the stored state for whatever round is active.
export function parseRoundState(
    roundId: string,
    raw: unknown
): GiaiMaState | ButPhaState | KhoiDongState {
    if (roundId === "giai-ma") return parseGiaiMaState(raw);
    if (roundId === "but-pha") return parseButPhaState(raw);
    if (roundId === "khoi-dong") return parseKhoiDongState(raw);
    throw new LiveStateError(`no state schema for round "${roundId}"`);
}
