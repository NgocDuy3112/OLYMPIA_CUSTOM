import { Type, Static } from "@sinclair/typebox";
import { IsoDateTime } from "./primitives.js";


export const StageRoleSchema = Type.Union([
    Type.Literal("splitting"),
    Type.Literal("playoff"),
    Type.Literal("finale")
]);
export type StageRole = Static<typeof StageRoleSchema>;

export const StageSchema = Type.Object({
    id: Type.String(),
    title: Type.String(),
    role: Type.Optional(StageRoleSchema),
    start: Type.Optional(IsoDateTime),
    end: Type.Optional(IsoDateTime)
});
export type Stage = Static<typeof StageSchema>;


export const TournamentRoundSchema = Type.Object({
    id: Type.String(),
    name: Type.String(),
    order: Type.Integer(),
    chart: Type.String()
});
export type TournamentRound = Static<typeof TournamentRoundSchema>;


export const TournamentFormatSchema = Type.Object({
    competitorsPerMatch: Type.Integer(),
    allowedCompetitorCounts: Type.Optional(Type.Array(Type.Integer(), { minItems: 1 })),
});

export type TournamentFormat = Static<typeof TournamentFormatSchema>;

export function allowedSeatCounts(format: TournamentFormat): number[] {
    return format.allowedCompetitorCounts ?? [format.competitorsPerMatch];
}
