import { Type, Static } from "@sinclair/typebox";
import { IsoDateTime } from "./primitives.js";

// ─── §10 — Stage ─────────────────────────────────────────────────────────────

// What a stage is for. The role tells the engine which rule the stage's matches must
// follow, so the staff can place the matches by hand and still be checked against the
// format:
//   splitting — the tier draw: one player from each tier of the current ranking, per match
//   playoff   — the ladder: the winner climbs a slot, the losers drop one
//   finale   — the four ladder winners, and the tournament's places 1–4
export const StageRoleSchema = Type.Union([
    Type.Literal("splitting"),
    Type.Literal("playoff"),
    Type.Literal("finale")
]);
export type StageRole = Static<typeof StageRoleSchema>;

// A stage of the tournament. The list is ordered: that order is how far the rounds go, and
// it decides the tournament's places.
export const StageSchema = Type.Object({
    id: Type.String(),
    title: Type.String(),
    role: Type.Optional(StageRoleSchema),
    start: Type.Optional(IsoDateTime),
    end: Type.Optional(IsoDateTime)
});
export type Stage = Static<typeof StageSchema>;

// ─── §11 — TournamentRound ───────────────────────────────────────────────────────

export const TournamentRoundSchema = Type.Object({
    id: Type.String(),
    name: Type.String(),
    order: Type.Integer(),
    chart: Type.String()
});
export type TournamentRound = Static<typeof TournamentRoundSchema>;

// ─── §12 — TournamentFormat ──────────────────────────────────────────────────

export const TournamentFormatSchema = Type.Object({
    competitorsPerMatch: Type.Integer(),
    // The seat counts a match of this tournament may hold, when it is not a fixed
    // number. AOC group-stage matches hold 3 or 4 per match (the team-point scale
    // resolves by the actual count at match end): [3, 4]. Absent → the fixed
    // competitorsPerMatch, which is also what classic tournaments use as the
    // splitting tier size.
    allowedCompetitorCounts: Type.Optional(Type.Array(Type.Integer(), { minItems: 1 })),
});

// The format carries NO team knobs: teams are gone (see SeatSchema). A group
// stage is a ROSTER property — `tournament_players.group` — and its accent is
// the placement→group-point scale in engine/scoring/group-stage.ts.
export type TournamentFormat = Static<typeof TournamentFormatSchema>;

// The seat counts a match of this tournament is allowed to hold.
// A tournament with allowedCompetitorCounts (AOC: [3, 4]) accepts any of them,
// per match; every other tournament holds exactly competitorsPerMatch seats.
export function allowedSeatCounts(format: TournamentFormat): number[] {
    return format.allowedCompetitorCounts ?? [format.competitorsPerMatch];
}

// ─── §13 — PlacementTier ─────────────────────────────────────────────────────

export const PlacementTierSchema = Type.Object({
    min: Type.Integer(),
    max: Type.Integer(),
    points: Type.Integer()
});
export type PlacementTier = Static<typeof PlacementTierSchema>;