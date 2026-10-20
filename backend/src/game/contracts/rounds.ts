import { Type, Static } from "@sinclair/typebox";
import { McKind, TextKind, KeywordKind, OralMode, TextMode } from "./primitives.js";


export const ScoringRuleSchema = Type.Union([
    Type.Object({
        template: Type.Literal("constant"),
        points: Type.Integer()
    }),
    Type.Object({
        template: Type.Literal("keyword_derived"),
        initial: Type.Integer(),
        dropPerHint: Type.Integer(),
        incorrect: Type.Literal(0)
    }),
    Type.Object({
        template: Type.Literal("rank_multiplier"),
        bands: Type.Array(Type.Object({ untilSec: Type.Integer(), points: Type.Integer() })),
        ladderTop: Type.Integer(),
        incorrect: Type.Literal(0),
        timeBasis: Type.Union([Type.Literal("first"), Type.Literal("final")])
    }),
    Type.Object({
        template: Type.Literal("outcome_multipliers"),
        correct: Type.Number(),
        incorrect: Type.Number(),
        powers: Type.Object({
            hope: Type.Object({ correct: Type.Number(), incorrect: Type.Number() }),
            shield: Type.Object({ correct: Type.Number(), incorrect: Type.Number() })
        })
    })
]);
export type ScoringRule = Static<typeof ScoringRuleSchema>;


export const TurnConfigSchema = Type.Object({
    id: Type.String(),
    mode: Type.Union([OralMode, TextMode]),
    delivery: Type.Union([
        Type.Literal("sequential"),
        Type.Literal("batch"),
        Type.Literal("pick")
    ]),
    timeBudgetSeconds: Type.Optional(Type.Integer()),
    timeLimitSeconds: Type.Optional(Type.Integer()),
    buzzWindowSeconds: Type.Optional(Type.Integer()),
    pickCount: Type.Optional(Type.Integer()),
    questionCount: Type.Optional(Type.Integer({ minimum: 0 }))
});
export type TurnConfig = Static<typeof TurnConfigSchema>;

export const RoundConfigSchema = Type.Object({
    allowedKinds: Type.Array(Type.Union([McKind, TextKind, KeywordKind])),
    scoring: ScoringRuleSchema,
    turns: Type.Array(TurnConfigSchema)
});
export type RoundConfig = Static<typeof RoundConfigSchema>;