import { Type, Static } from "@sinclair/typebox";
import { Uuid, McKind, TextKind, KeywordKind, HintKind, OralMode, TextMode } from "./primitives.js";


export const MediaSchema = Type.Object({
    url: Type.String(),
    type: Type.Union([Type.Literal("image"), Type.Literal("audio"), Type.Literal("video")])
});
export type Media = Static<typeof MediaSchema>;



export const NormalizeSchema = Type.Object({
    caseSensitive: Type.Boolean(),
    trim: Type.Boolean(),
    stripAccents: Type.Boolean()
});
export type Normalize = Static<typeof NormalizeSchema>;

export const QuestionPayloadSchema = Type.Union([
    Type.Object({
        options: Type.Array(Type.Object({ id: Type.String(), text: Type.String() })),
        correctSet: Type.Array(Type.String())
    }),
    Type.Object({
        acceptedAnswers: Type.Array(Type.String()),
        normalize: NormalizeSchema
    }),
    Type.Object({
        code: Type.String(),
        normalize: NormalizeSchema
    })
]);
export type QuestionPayload = Static<typeof QuestionPayloadSchema>;


export const MatchQuestionSchema = Type.Object({
    _id: Uuid,
    roundId: Type.String(),
    turnId: Type.String(),
    position: Type.Integer(),
    mode: Type.Union([OralMode, TextMode]),
    kind: Type.Union([McKind, TextKind, KeywordKind, HintKind]),
    questionText: Type.String(),
    media: Type.Union([MediaSchema, Type.Null()]),
    timeLimit: Type.Union([Type.Integer(), Type.Null()]),
    points: Type.Integer(),
    // The ve-dich board's category label (presentation only). Optional: copies
    // frozen before this field existed simply carry none.
    domain: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    payload: QuestionPayloadSchema,
    sourceId: Uuid
});
export type MatchQuestion = Static<typeof MatchQuestionSchema>;