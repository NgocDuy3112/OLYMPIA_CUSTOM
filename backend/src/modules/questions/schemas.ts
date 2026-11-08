import "../../lib/typebox-formats.js";
import { Type, Static, TSchema } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import {
    HintKind,
    KeywordKind,
    ChoiceKind,
    MediaSchema,
    QuestionPayloadSchema,
    TextKind,
    Uuid
} from "../../game/contracts/index.js";
import { QuestionError } from "./errors.js";

export const MAX_BATCH_SIZE = 500;

export const MAX_PAGE_SIZE = 500;

export const QuestionKind = Type.Union([ChoiceKind, TextKind, KeywordKind, HintKind]);

export const QuestionStatus = Type.Union([
    Type.Literal("DRAFT"),
    Type.Literal("PENDING"),
    Type.Literal("PUBLISHED"),
    Type.Literal("ARCHIVED")
]);


export const CreateQuestionInput = Type.Object({
    kind: QuestionKind,
    questionText: Type.String({ minLength: 1 }),
    keywordId: Type.Optional(Type.Union([Uuid, Type.Null()])),
    payload: QuestionPayloadSchema,
    media: Type.Optional(Type.Union([MediaSchema, Type.Null()])),
    timeLimit: Type.Optional(Type.Union([Type.Integer({ minimum: 1 }), Type.Null()])),
    tags: Type.Optional(Type.Array(Type.String({ minLength: 1, maxLength: 64 }), { maxItems: 8 }))
});
export type CreateQuestionInput = Static<typeof CreateQuestionInput>;


export const UpdateQuestionInput = Type.Partial(CreateQuestionInput);
export type UpdateQuestionInput = Static<typeof UpdateQuestionInput>;


export const TransitionQuestionInput = Type.Object({ status: QuestionStatus });
export type TransitionQuestionInput = Static<typeof TransitionQuestionInput>;


export const BatchEnvelope = Type.Object({
    dryRun: Type.Optional(Type.Boolean()),
    questions: Type.Array(Type.Unknown(), { minItems: 1, maxItems: MAX_BATCH_SIZE })
});
export type BatchEnvelope = Static<typeof BatchEnvelope>;


export const ListQuery = Type.Object({
    status: Type.Optional(QuestionStatus),
    kind: Type.Optional(QuestionKind),
    keywordId: Type.Optional(Type.String({ format: "uuid" })),
    search: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
    ids: Type.Optional(Type.String({ maxLength: 4100 })),
    cursor: Type.Optional(Type.String({ format: "uuid" })),
    bucket: Type.Optional(Type.String({ maxLength: 64 })),
    limit: Type.Optional(Type.String({ pattern: "^\\d+$" })),
    offset: Type.Optional(Type.String({ pattern: "^\\d+$" }))
});
export type ListQuery = Static<typeof ListQuery>;

export const BucketCountsQuery = Type.Object({
    status: Type.Optional(QuestionStatus),
    search: Type.Optional(Type.String({ minLength: 1, maxLength: 200 }))
});
export type BucketCountsQuery = Static<typeof BucketCountsQuery>;

export const EligibleListQuery = Type.Object({
    kinds: Type.Optional(Type.String({ pattern: "^(console|TEXT|KEYWORD|HINT)(,(console|TEXT|KEYWORD|HINT))*$" })),
    bucket: Type.Optional(Type.String({ maxLength: 64 })),
    search: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
    limit: Type.Optional(Type.String({ pattern: "^\\d+$" })),
    offset: Type.Optional(Type.String({ pattern: "^\\d+$" }))
});
export type EligibleListQuery = Static<typeof EligibleListQuery>;


export function validate(schema: TSchema, value: unknown): void {
    if (!Value.Check(schema, value)) {
        const details = Array.from(Value.Errors(schema, value)).map(
            (e) => `${e.path || "<root>"}: ${e.message}`
        );
        throw new QuestionError("VALIDATION", "Question payload failed validation", details);
    }
}
