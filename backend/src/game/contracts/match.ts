import { Type, Static } from "@sinclair/typebox";
import {
    Uuid,
    IsoDateTime,
    VerdictSchema,
    UserKind,
    TeamKind
} from "./primitives.js";

// ─── §1 — Seat ───────────────────────────────────────────────────────────────

export const SeatSchema = Type.Union([
    Type.Object({ kind: UserKind, userId: Uuid, seed: Type.Integer() }),
    Type.Object({ kind: TeamKind, teamId: Uuid, seed: Type.Integer() })
]);
export type Seat = Static<typeof SeatSchema>;

// ─── §6 — AnswerValue ────────────────────────────────────────────────────────

// A submitted answer is either a selection or typed text. An oral answer is a distinct
// shape: the player said it out loud, so there is no typed content — only a verdict.
export const SubmittedAnswerValueSchema = Type.Union([
    Type.Object({ picked: Type.Array(Type.String(), { minItems: 1 }) }),
    Type.Object({ text: Type.String({ minLength: 1 }) })
]);
export type SubmittedAnswerValue = Static<typeof SubmittedAnswerValueSchema>;

export const AnswerValueSchema = Type.Union([
    Type.Object({ picked: Type.Array(Type.String(), { minItems: 1 }) }),
    Type.Object({ text: Type.String({ minLength: 1 }) }),
    Type.Object({ oral: Type.Literal(true) })
]);
export type AnswerValue = Static<typeof AnswerValueSchema>;

export const DraftsSchema = Type.Record(Uuid, VerdictSchema);
export type Drafts = Static<typeof DraftsSchema>;


export const MatchLiveSchema = Type.Object({
    phase: Type.Union([
        Type.Literal("question_open"),
        Type.Literal("judging"),
        Type.Literal("paused")
    ]),
    questionId: Uuid,
    openedAt: IsoDateTime,
    deadlineAt: IsoDateTime
});
export type MatchLive = Static<typeof MatchLiveSchema>;

// ─── §9 — ResultEntry ────────────────────────────────────────────────────────

export const ResultEntrySchema = Type.Object({
    kind: Type.Union([UserKind, TeamKind]),
    userId: Type.Optional(Uuid),
    teamId: Type.Optional(Uuid),
    totalScore: Type.Integer(),
    rank: Type.Integer(),
    roundScores: Type.Record(Type.String(), Type.Integer())
});
export type ResultEntry = Static<typeof ResultEntrySchema>;

// ─── §14 — MatchDiscord ──────────────────────────────────────────────────────

export const MatchDiscordSchema = Type.Object({
    announcementChannelId: Type.Optional(Type.String()),
    announcementMessageId: Type.Optional(Type.String()),
    liveBoardMessageId: Type.Optional(Type.String()),
    lobbyChannelId: Type.Optional(Type.String()),
    boothChannelId: Type.Optional(Type.String())
});
export type MatchDiscord = Static<typeof MatchDiscordSchema>;

// ─── §15 — MatchEventPayload ─────────────────────────────────────────────────

export const MatchEventPayloadSchema = Type.Union([
    Type.Object({ kind: Type.Literal("PICK"), turnId: Type.String(), pickOrder: Type.Integer() }),
    Type.Object({ kind: Type.Literal("BUZZ"), buzzMs: Type.Integer(), won: Type.Boolean() }),
    Type.Object({
        kind: Type.Literal("POWER"),
        power: Type.Union([Type.Literal("HOPE"), Type.Literal("SHIELD")])
    })
]);
export type MatchEventPayload = Static<typeof MatchEventPayloadSchema>;