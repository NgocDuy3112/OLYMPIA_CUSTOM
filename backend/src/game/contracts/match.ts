import { Type, Static } from "@sinclair/typebox";
import {
    Uuid,
    IsoDateTime,
    VerdictSchema,
    UserKind
} from "./primitives.js";


export const SeatSchema = Type.Object({ kind: UserKind, userId: Uuid, seed: Type.Integer() });
export type Seat = Static<typeof SeatSchema>;


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


export const ResultEntrySchema = Type.Object({
    kind: UserKind,
    userId: Uuid,
    totalScore: Type.Integer(),
    rank: Type.Integer(),
    roundScores: Type.Record(Type.String(), Type.Integer())
});
export type ResultEntry = Static<typeof ResultEntrySchema>;


export const MatchDiscordSchema = Type.Object({
    announcementChannelId: Type.Optional(Type.String()),
    announcementMessageId: Type.Optional(Type.String()),
    liveBoardMessageId: Type.Optional(Type.String()),
    lobbyChannelId: Type.Optional(Type.String()),
    boothChannelId: Type.Optional(Type.String())
});
export type MatchDiscord = Static<typeof MatchDiscordSchema>;


export const MatchEventPayloadSchema = Type.Union([
    Type.Object({ kind: Type.Literal("PICK"), turnId: Type.String(), pickOrder: Type.Integer() }),
    Type.Object({ kind: Type.Literal("BUZZ"), buzzMs: Type.Integer(), won: Type.Boolean() }),
    Type.Object({
        kind: Type.Literal("POWER"),
        power: Type.Union([Type.Literal("STAR"), Type.Literal("ASSIGN")]),
        targetId: Type.Optional(Uuid)
    })
]);
export type MatchEventPayload = Static<typeof MatchEventPayloadSchema>;
