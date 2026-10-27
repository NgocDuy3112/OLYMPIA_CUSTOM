// The public read surface's wire shapes. These are the SECOND lock on what leaves the
// server: the serializer picks fields, and the response schemas strip anything else.
import "../../lib/typebox-formats.js";
import { Type, Static } from "@sinclair/typebox";
import {
    IsoDateTime,
    PlacementTierSchema,
    StageSchema,
    TournamentFormatSchema,
    TournamentRoundSchema,
    Uuid
} from "../../game/contracts/index.js";

// A spectator's URL carries the slug, never the id: it is the human-readable name
// minted by the tournaments module (slugify → [a-z0-9-], unique index from migration 0016).
export const slugParams = {
    type: "object",
    required: ["slug"],
    additionalProperties: false,
    properties: { slug: { type: "string", pattern: "^[a-z0-9-]{1,100}$" } }
} as const;

// Pagination arrives as strings: ajv runs with coerceTypes: false (see app.ts), so the
// parse happens in lib/pagination — same contract as the portal's list routes.
// Pagination is parsed by lib/pagination — no pattern here, so one validator and
// one error shape (PaginationError → 400 VALIDATION) rather than two.
export const PublicPageQuery = Type.Object({
    limit: Type.Optional(Type.String()),
    offset: Type.Optional(Type.String())
});
export type PublicPageQuery = Static<typeof PublicPageQuery>;


// ─── A seated player, resolved to a name ─────────────────────────────────────

export const PublicPlayer = Type.Object({
    id: Uuid,
    name: Type.String(),
    seed: Type.Integer()
}, { additionalProperties: false });
export type PublicPlayer = Static<typeof PublicPlayer>;

// A final result of a FINISHED match — the stored match_results entry, with the
// player's name resolved. No question-level detail: the totals are the ranking,
// the stats table is not public.
export const PublicResultEntry = Type.Object({
    id: Uuid,
    name: Type.String(),
    totalScore: Type.Integer(),
    rank: Type.Integer(),
    roundScores: Type.Record(Type.String(), Type.Integer())
}, { additionalProperties: false });
export type PublicResultEntry = Static<typeof PublicResultEntry>;

export const PublicMatch = Type.Object({
    id: Uuid,
    stageId: Type.String(),
    slot: Type.Union([Type.Integer(), Type.Null()]),
    status: Type.Union([Type.Literal("UPCOMING"), Type.Literal("LIVE"), Type.Literal("FINISHED")]),
    scheduledAt: IsoDateTime,
    // "<stage title> · <label>" — the display string the schedule shows.
    round: Type.String(),
    players: Type.Array(PublicPlayer),
    // Only FINISHED matches carry results.
    results: Type.Optional(Type.Array(PublicResultEntry))
}, { additionalProperties: false });
export type PublicMatch = Static<typeof PublicMatch>;


// ─── The tournament ──────────────────────────────────────────────────────────

// What the points of a place are worth, and where the scale has gaps — the
// standings' "Quy tắc tính điểm" panel reads this. Same shape as the portal's.
export const ScaleCoverageSchema = Type.Object({
    places: Type.Integer(),
    covered: Type.Integer(),
    missing: Type.Array(Type.Integer()),
    beyond: Type.Array(Type.Integer())
}, { additionalProperties: false });

export const PublicTournament = Type.Object({
    id: Uuid,
    slug: Type.String(),
    name: Type.String(),
    current: Type.Boolean(),
    createdAt: IsoDateTime,
    closedAt: Type.Union([IsoDateTime, Type.Null()]),
    // Derived from the stage list: the earliest start and the latest end.
    start: Type.Union([IsoDateTime, Type.Null()]),
    end: Type.Union([IsoDateTime, Type.Null()]),
    // The four rounds and their chart data — the match view renders from these.
    rounds: Type.Array(TournamentRoundSchema),
    format: TournamentFormatSchema,
    // The stage list is the tournament's spine and is meant to be public.
    stages: Type.Array(StageSchema),
    // The points-for-places scale is a preset the tournament chose; it is the
    // public rules of the show. The rulebook (roundRules) stays internal.
    placementTiers: Type.Array(PlacementTierSchema),
    places: Type.Integer(),
    points: ScaleCoverageSchema
}, { additionalProperties: false });
export type PublicTournament = Static<typeof PublicTournament>;

// The list route: enough to pick a tournament, nothing to leak.
export const PublicTournamentSummary = Type.Object({
    id: Uuid,
    slug: Type.String(),
    name: Type.String(),
    current: Type.Boolean(),
    createdAt: IsoDateTime,
    start: Type.Union([IsoDateTime, Type.Null()]),
    end: Type.Union([IsoDateTime, Type.Null()])
}, { additionalProperties: false });
export type PublicTournamentSummary = Static<typeof PublicTournamentSummary>;


// ─── Responses ───────────────────────────────────────────────────────────────

export const TournamentListResponse = Type.Object({
    tournaments: Type.Array(PublicTournamentSummary)
}, { additionalProperties: false });

export const ScheduleResponse = Type.Object({
    items: Type.Array(PublicMatch),
    total: Type.Integer(),
    limit: Type.Integer(),
    offset: Type.Integer()
}, { additionalProperties: false });

// A standings row is the places table's own shape — the engine's PlayerStanding,
// which is already display data.
export const PublicStandingRow = Type.Object({
    userId: Uuid,
    displayName: Type.String(),
    place: Type.Union([Type.Integer(), Type.Null()]),
    matchesPlayed: Type.Integer(),
    placementPoints: Type.Integer(),
    stageId: Type.Union([Type.String(), Type.Null()]),
    stageTitle: Type.Union([Type.String(), Type.Null()]),
    slot: Type.Union([Type.Integer(), Type.Null()])
}, { additionalProperties: false });

export const StandingsResponse = Type.Object({
    rows: Type.Array(PublicStandingRow)
}, { additionalProperties: false });
