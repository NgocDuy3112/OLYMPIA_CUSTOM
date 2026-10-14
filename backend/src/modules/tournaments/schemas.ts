import { Type, Static } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import {
    SeasonRoundSchema,
    TournamentFormatSchema,
    PlacementTierSchema
} from "../../game/contracts/index.js";
import { TournamentError } from "./errors.js";

export const CreateTournamentInput = Type.Object({
    name: Type.String({ minLength: 1 }),
    slug: Type.String({ minLength: 1, maxLength: 100 }),
    visibility: Type.Optional(Type.Union([Type.Literal("PUBLIC"), Type.Literal("PRIVATE")])),
    defaultTags: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
    defaultRounds: Type.Array(SeasonRoundSchema),
    defaultFormat: TournamentFormatSchema,
    defaultPlacementTiers: Type.Array(PlacementTierSchema)
});
export type CreateTournamentInput = Static<typeof CreateTournamentInput>;

export const UpdateTournamentInput = Type.Partial(CreateTournamentInput);
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