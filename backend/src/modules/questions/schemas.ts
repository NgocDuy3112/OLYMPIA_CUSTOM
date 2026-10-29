import "../../lib/typebox-formats.js";
import { Type, Static, TSchema } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import {
    HintKind,
    KeywordKind,
    McKind,
    MediaSchema,
    QuestionPayloadSchema,
    TextKind,
    Uuid
} from "../../game/contracts/index.js";
import { QuestionError } from "./errors.js";

export const MAX_BATCH_SIZE = 500;

export const QuestionKind = Type.Union([McKind, TextKind, KeywordKind, HintKind]);

export const QuestionStatus = Type.Union([
    Type.Literal("DRAFT"),
    Type.Literal("PENDING"),
    Type.Literal("PUBLISHED"),
    Type.Literal("ARCHIVED")
]);


export const CreateQuestionInput = Type.Object({
    kind: QuestionKind,
    questionText: Type.String({ minLength: 1 }),
    // Presentation-only board category for the ve-dich grid.
    domain: Type.Optional(Type.Union([Type.String({ maxLength: 64 }), Type.Null()])),
    // A HINT carries the keyword of its set; the service enforces the pairing.
    // Null clears the link (a HINT converted back to TEXT).
    keywordId: Type.Optional(Type.Union([Uuid, Type.Null()])),
    payload: QuestionPayloadSchema,
    media: Type.Optional(Type.Union([MediaSchema, Type.Null()])),
    timeLimit: Type.Optional(Type.Union([Type.Integer({ minimum: 1 }), Type.Null()]))
});
export type CreateQuestionInput = Static<typeof CreateQuestionInput>;


export const UpdateQuestionInput = Type.Partial(CreateQuestionInput);
export type UpdateQuestionInput = Static<typeof UpdateQuestionInput>;


export const TransitionQuestionInput = Type.Object({ status: QuestionStatus });
export type TransitionQuestionInput = Static<typeof TransitionQuestionInput>;


// Envelope only: the service validates each row so a dry run can report every
// failure with its index, instead of ajv aborting on the first bad row.
export const BatchEnvelope = Type.Object({
    dryRun: Type.Optional(Type.Boolean()),
    questions: Type.Array(Type.Unknown(), { minItems: 1, maxItems: MAX_BATCH_SIZE })
});
export type BatchEnvelope = Static<typeof BatchEnvelope>;


// Scope comes from the URL (nested route) or is implicitly the global bank
// (flat route), so the query carries filters only.
export const ListQuery = Type.Object({
    status: Type.Optional(QuestionStatus),
    kind: Type.Optional(QuestionKind),
    keywordId: Type.Optional(Type.String({ format: "uuid" })),
    search: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
    limit: Type.Optional(Type.String({ pattern: "^\\d+$" })),
    offset: Type.Optional(Type.String({ pattern: "^\\d+$" }))
});
export type ListQuery = Static<typeof ListQuery>;

// Eligible-for-assembly browse: scope comes from the URL (own + global bank).
export const EligibleListQuery = Type.Object({
    kinds: Type.Optional(Type.String({ pattern: "^(MC|TEXT|KEYWORD|HINT)(,(MC|TEXT|KEYWORD|HINT))*$" })),
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
