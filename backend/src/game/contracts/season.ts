import { Type, Static } from "@sinclair/typebox";
import { IsoDateTime, UserKind, TeamKind } from "./primitives.js";

// ─── §10 — Stage ─────────────────────────────────────────────────────────────

// What a stage is for. The role tells the engine which rule the stage's matches must
// follow, so the staff can place the matches by hand and still be checked against the
// format:
//   splitting — the tier draw: one player from each tier of the current ranking, per match
//   playoff   — the ladder: the winner climbs a slot, the losers drop one
//   finale   — the four ladder winners, and the season's places 1–4
export const StageRoleSchema = Type.Union([
    Type.Literal("splitting"),
    Type.Literal("playoff"),
    Type.Literal("finale")
]);
export type StageRole = Static<typeof StageRoleSchema>;

// A stage of the season. The list is ordered: that order is how far the rounds go, and
// it decides the season's places.
export const StageSchema = Type.Object({
    id: Type.String(),
    title: Type.String(),
    role: Type.Optional(StageRoleSchema),
    start: Type.Optional(IsoDateTime),
    end: Type.Optional(IsoDateTime)
});
export type Stage = Static<typeof StageSchema>;

// ─── §11 — SeasonRound ───────────────────────────────────────────────────────

export const SeasonRoundSchema = Type.Object({
    id: Type.String(),
    name: Type.String(),
    order: Type.Integer(),
    chart: Type.String()
});
export type SeasonRound = Static<typeof SeasonRoundSchema>;

// ─── §12 — TournamentFormat ──────────────────────────────────────────────────

export const TournamentFormatSchema = Type.Object({
    competitorsPerMatch: Type.Integer(),
    allowedSeatKinds: Type.Array(Type.Union([UserKind, TeamKind])),
    teamSize: Type.Union([Type.Integer(), Type.Null()]),
    teamAggregation: Type.Union([
        Type.Literal("sum"),
        Type.Literal("best"),
        Type.Literal("avg"),
        Type.Null()
    ]),
    teamCountAggregation: Type.Union([Type.Literal("sum"), Type.Literal("none"), Type.Null()])
});
export type TournamentFormat = Static<typeof TournamentFormatSchema>;

// ─── §13 — PlacementTier ─────────────────────────────────────────────────────

export const PlacementTierSchema = Type.Object({
    min: Type.Integer(),
    max: Type.Integer(),
    points: Type.Integer()
});
export type PlacementTier = Static<typeof PlacementTierSchema>;