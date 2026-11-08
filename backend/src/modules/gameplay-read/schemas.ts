import "../../lib/typebox-formats.js";
import { Type, Static } from "@sinclair/typebox";
import {
    IsoDateTime,
    StageSchema,
    TournamentFormatSchema,
    TournamentRoundSchema,
    Uuid
} from "../../game/contracts/index.js";

export const slugParams = {
    type: "object",
    required: ["slug"],
    additionalProperties: false,
    properties: { slug: { type: "string", pattern: "^[a-z0-9-]{1,100}$" } }
} as const;

export const PublicPageQuery = Type.Object({
    limit: Type.Optional(Type.String()),
    offset: Type.Optional(Type.String())
});
export type PublicPageQuery = Static<typeof PublicPageQuery>;



export const PublicPlayer = Type.Object({
    id: Uuid,
    name: Type.String(),
    seed: Type.Integer()
}, { additionalProperties: false });
export type PublicPlayer = Static<typeof PublicPlayer>;

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
    round: Type.String(),
    players: Type.Array(PublicPlayer),
    results: Type.Optional(Type.Array(PublicResultEntry))
}, { additionalProperties: false });
export type PublicMatch = Static<typeof PublicMatch>;



export const PublicTournament = Type.Object({
    id: Uuid,
    slug: Type.String(),
    name: Type.String(),
    current: Type.Boolean(),
    createdAt: IsoDateTime,
    closedAt: Type.Union([IsoDateTime, Type.Null()]),
    start: Type.Union([IsoDateTime, Type.Null()]),
    end: Type.Union([IsoDateTime, Type.Null()]),
    rounds: Type.Array(TournamentRoundSchema),
    format: TournamentFormatSchema,
    stages: Type.Array(StageSchema),
    places: Type.Integer()
}, { additionalProperties: false });
export type PublicTournament = Static<typeof PublicTournament>;

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



export const TournamentListResponse = Type.Object({
    tournaments: Type.Array(PublicTournamentSummary)
}, { additionalProperties: false });

export const ScheduleResponse = Type.Object({
    items: Type.Array(PublicMatch),
    total: Type.Integer(),
    limit: Type.Integer(),
    offset: Type.Integer()
}, { additionalProperties: false });

export const PublicStandingRow = Type.Object({
    userId: Uuid,
    displayName: Type.String(),
    place: Type.Union([Type.Integer(), Type.Null()]),
    matchesPlayed: Type.Integer(),
    stageId: Type.Union([Type.String(), Type.Null()]),
    stageTitle: Type.Union([Type.String(), Type.Null()]),
    slot: Type.Union([Type.Integer(), Type.Null()])
}, { additionalProperties: false });

export const StandingsResponse = Type.Object({
    rows: Type.Array(PublicStandingRow)
}, { additionalProperties: false });
