import { Type, Static } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import type { GiaiMaState } from "../../game/engine/turns/giai-ma.js";
import type { ButPhaState } from "../../game/engine/turns/but-pha.js";
import type { KhoiDongState } from "../../game/engine/turns/khoi-dong-round.js";
import type { VeDichState } from "../../game/engine/turns/ve-dich.js";


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
    openHintAt: Type.Union([Type.String(), Type.Null()]),
    revealedAnswer: Type.Optional(Type.Union([Type.String(), Type.Null()]))
});

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
    ended: Type.Boolean(),
    revealedAnswer: Type.Optional(Type.Union([Type.String(), Type.Null()]))
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
    pointsPerCorrect: Type.Integer(),
    windowS: Type.Integer(),
    questionIds: Type.Array(Type.String()),
    index: Type.Integer({ minimum: 0 }),
    openedAt: Type.Union([Type.String(), Type.Null()]),
    results: Type.Record(Type.String(), Type.Record(Type.String(), Type.Integer())),
    closed: Type.Boolean()
});

export const KhoiDongStateSchema = Type.Object({
    stage: Type.Union([Type.Literal("phase1"), Type.Literal("phase2")]),
    ended: Type.Boolean(),
    order: Type.Array(Type.String()),
    activeIndex: Type.Integer({ minimum: 0 }),
    runs: Type.Record(Type.String(), KhoiDongPhase1RunSchema),
    phase2: Type.Union([KhoiDongPhase2Schema, Type.Null()]),
    revealedAnswer: Type.Optional(Type.Union([Type.String(), Type.Null()]))
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


const PowerSchema = Type.Union([Type.Literal("STAR"), Type.Literal("ASSIGN")]);

export const VeDichQuestionSchema = Type.Object({
    id: Type.String(),
    value: Type.Integer(),
    timeLimit: Type.Optional(Type.Union([Type.Integer(), Type.Null()]))
});

export const VeDichPlayerSchema = Type.Object({
    id: Type.String(),
    score: Type.Integer(),
    powersLeft: Type.Array(PowerSchema)
});

export const VeDichOpenSchema = Type.Object({
    question: VeDichQuestionSchema,
    answerer: Type.String(),
    power: Type.Union([PowerSchema, Type.Null()]),
    stage: Type.Union([Type.Literal("current"), Type.Literal("buzz")]),
    buzzer: Type.Union([Type.String(), Type.Null()]),
    buzzerMs: Type.Optional(Type.Union([Type.Integer(), Type.Null()])),
    assignedTo: Type.Optional(Type.Union([Type.String(), Type.Null()]))
});

export const VeDichStateSchema = Type.Object({
    phase: Type.Union([Type.Literal(1), Type.Literal(2)]),
    players: Type.Array(VeDichPlayerSchema),
    remaining: Type.Array(VeDichQuestionSchema),
    deferred: Type.Optional(Type.Array(VeDichQuestionSchema)),
    turnIndex: Type.Integer({ minimum: 0 }),
    pendingPicks: Type.Array(VeDichQuestionSchema),
    open: Type.Union([VeDichOpenSchema, Type.Null()]),
    buzzOpenedAt: Type.Union([Type.String(), Type.Null()]),
    buzzLocked: Type.Optional(Type.Boolean()),
    ended: Type.Boolean(),
    stagedPower: Type.Optional(Type.Union([
        Type.Object({
            power: Type.Union([Type.Literal("STAR"), Type.Literal("ASSIGN")]),
            targetId: Type.Optional(Type.String())
        }),
        Type.Null()
    ])),
    turnPowerUsed: Type.Optional(Type.Boolean()),
    revealedAnswer: Type.Optional(Type.Union([Type.String(), Type.Null()]))
});

export function parseVeDichState(raw: unknown): VeDichState {
    if (!Value.Check(VeDichStateSchema, raw)) {
        const details = Array.from(Value.Errors(VeDichStateSchema, raw))
            .slice(0, 5)
            .map((e) => `${e.path || "<root>"}: ${e.message}`);
        throw new LiveStateError("stored ve-dich state failed validation", details);
    }
    return raw as VeDichState;
}

export function parseRoundState(
    roundId: string,
    raw: unknown
): GiaiMaState | ButPhaState | KhoiDongState | VeDichState {
    if (roundId === "giai-ma") return parseGiaiMaState(raw);
    if (roundId === "but-pha") return parseButPhaState(raw);
    if (roundId === "khoi-dong") return parseKhoiDongState(raw);
    if (roundId === "ve-dich") return parseVeDichState(raw);
    throw new LiveStateError(`no state schema for round "${roundId}"`);
}
