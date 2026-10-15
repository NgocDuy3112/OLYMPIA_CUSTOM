import "../../lib/typebox-formats.js";
import { Type, Static } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import {
    SeasonRoundSchema,
    TournamentFormatSchema,
    PlacementTierSchema,
    StageSchema
} from "../../game/contracts/index.js";
import { SeasonError } from "./errors.js";

export const CreateSeasonInput = Type.Object({
    name: Type.String({ minLength: 1 }),
    stages: Type.Array(StageSchema),
    rounds: Type.Optional(Type.Array(SeasonRoundSchema)),
    format: Type.Optional(TournamentFormatSchema),
    placementTiers: Type.Optional(Type.Array(PlacementTierSchema)),
    current: Type.Optional(Type.Boolean())
});
export type CreateSeasonInput = Static<typeof CreateSeasonInput>;

export const UpdateSeasonInput = Type.Partial(CreateSeasonInput);
export type UpdateSeasonInput = Static<typeof UpdateSeasonInput>;

export function validate(
    schema: typeof CreateSeasonInput | typeof UpdateSeasonInput,
    value: unknown
): void {
    if (!Value.Check(schema, value)) {
        const details = Array.from(Value.Errors(schema, value)).map(
            (e) => `${e.path || "<root>"}: ${e.message}`
        );
        throw new SeasonError("VALIDATION", "Season payload failed validation", details);
    }
}