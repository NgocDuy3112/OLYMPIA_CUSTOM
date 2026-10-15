import "../../lib/typebox-formats.js";
import { Type, Static, TSchema } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import {
    IsoDateTime,
    RoundConfigSchema,
    SeatSchema,
    Uuid
} from "../../game/contracts/index.js";
import { MatchError } from "./errors.js";

export const MatchStatus = Type.Union([
    Type.Literal("UPCOMING"),
    Type.Literal("LIVE"),
    Type.Literal("FINISHED")
]);

export const AssemblyEntry = Type.Object({
    roundId: Type.String({ minLength: 1 }),
    turnId: Type.String({ minLength: 1 }),
    sourceId: Uuid,
    position: Type.Optional(Type.Integer({ minimum: 0 })),
    points: Type.Optional(Type.Integer())
});
export type AssemblyEntry = Static<typeof AssemblyEntry>;

export const AutoPick = Type.Object({
    roundId: Type.String({ minLength: 1 }),
    turnId: Type.String({ minLength: 1 }),
    count: Type.Integer({ minimum: 1, maximum: 200 })
});
export type AutoPick = Static<typeof AutoPick>;


export const CreateMatchInput = Type.Object({
    stageId: Type.String({ minLength: 1 }),
    label: Type.String({ minLength: 1 }),
    scheduledAt: IsoDateTime,
    players: Type.Optional(Type.Array(SeatSchema)),
    roundConfigs: Type.Record(Type.String(), RoundConfigSchema),
    questions: Type.Optional(Type.Array(AssemblyEntry)),
    autoPick: Type.Optional(Type.Array(AutoPick))
});
export type CreateMatchInput = Static<typeof CreateMatchInput>;


export const UpdateMatchInput = Type.Partial(Type.Object({
    stageId: Type.String({ minLength: 1 }),
    label: Type.String({ minLength: 1 }),
    scheduledAt: IsoDateTime,
    players: Type.Array(SeatSchema),
    roundConfigs: Type.Record(Type.String(), RoundConfigSchema)
}));
export type UpdateMatchInput = Static<typeof UpdateMatchInput>;


export const AssembleMatchInput = Type.Object({
    questions: Type.Optional(Type.Array(AssemblyEntry)),
    autoPick: Type.Optional(Type.Array(AutoPick))
});
export type AssembleMatchInput = Static<typeof AssembleMatchInput>;


export const TransitionMatchInput = Type.Object({ status: MatchStatus });
export type TransitionMatchInput = Static<typeof TransitionMatchInput>;


export const ListMatchesQuery = Type.Object({
    status: Type.Optional(MatchStatus),
    limit: Type.Optional(Type.String({ pattern: "^\\d+$" })),
    offset: Type.Optional(Type.String({ pattern: "^\\d+$" }))
});
export type ListMatchesQuery = Static<typeof ListMatchesQuery>;


export function validate(schema: TSchema, value: unknown): void {
    if (!Value.Check(schema, value)) {
        const details = Array.from(Value.Errors(schema, value)).map(
            (e) => `${e.path || "<root>"}: ${e.message}`
        );
        throw new MatchError("VALIDATION", "Match payload failed validation", details);
    }
}
