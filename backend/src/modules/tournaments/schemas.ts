import "../../lib/typebox-formats.js";
import { Type, Static } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import {
    TournamentRoundSchema,
    TournamentFormatSchema,
    PlacementTierSchema,
    StageSchema,
    RoundConfigSchema
} from "../../game/contracts/index.js";
import { TournamentError } from "./errors.js";

export const CreateTournamentInput = Type.Object({
    name: Type.String({ minLength: 1 }),
    visibility: Type.Optional(Type.Union([Type.Literal("PUBLIC"), Type.Literal("PRIVATE")])),
    stages: Type.Optional(Type.Array(StageSchema)),
    rounds: Type.Optional(Type.Array(TournamentRoundSchema)),
    format: Type.Optional(TournamentFormatSchema),
    placementTiers: Type.Optional(Type.Array(PlacementTierSchema)),
    roundRules: Type.Optional(Type.Record(Type.String(), RoundConfigSchema)),
    current: Type.Optional(Type.Boolean())
});
export type CreateTournamentInput = Static<typeof CreateTournamentInput>;

export const UpdateTournamentInput = Type.Partial(CreateTournamentInput);

export const ListTournamentsQuery = Type.Object({
    current: Type.Optional(Type.Union([Type.Literal("true"), Type.Literal("false")])),
    mine: Type.Optional(Type.Union([Type.Literal("true"), Type.Literal("false")])),
    limit: Type.Optional(Type.String({ pattern: "^\\d+$" })),
    offset: Type.Optional(Type.String({ pattern: "^\\d+$" }))
});
export type ListTournamentsQuery = Static<typeof ListTournamentsQuery>;
export type UpdateTournamentInput = Static<typeof UpdateTournamentInput>;

export function validate(
    schema: typeof CreateTournamentInput | typeof UpdateTournamentInput,
    value: unknown
): void {
    if (!Value.Check(schema, value)) {
        const details = Array.from(Value.Errors(schema, value)).map(
            (e) => `${e.path || "<root>"}: ${e.message}`
        );
        throw new TournamentError("VALIDATION", "Tournament payload failed validation", details);
    }
}