import {
    check,
    uuid,
    boolean,
    integer,
    varchar,
    text,
    timestamp,
    jsonb,
    uniqueIndex,
    index,
    pgEnum,
    pgTable
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { seasons } from "./reference.js";
import { users } from "./auth.js";
import { 
    Seat, 
    RoundConfig, 
    MatchQuestion, 
    MatchLive, 
    MatchDiscord, 
    AnswerValue,
    Drafts,
    ResultEntry,
    MatchEventPayload
} from "../../game/contracts/index.js";


export const matchStatus = pgEnum("match_status", ["UPCOMING", "LIVE", "FINISHED"]);
export const verdict = pgEnum("verdict", ["CORRECT", "INCORRECT"]);
export const power = pgEnum("power", ["HOPE", "SHIELD"]);
export const matchEventKind = pgEnum("match_event_kind", ["PICK", "BUZZ", "POWER"]);


export const matches = pgTable(
    "matches",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        seasonId: uuid("season_id")
            .notNull()
            .references(() => seasons.id),
        stageId: text("stage_id").notNull(),
        scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
        label: text("label").notNull(),
        status: matchStatus("status").notNull().default("UPCOMING"),

        players: jsonb("players").$type<Seat[]>().notNull(),
        roundConfigs: jsonb("round_configs").$type<Record<string, RoundConfig>>().notNull(),
        questions: jsonb("questions").$type<MatchQuestion[]>().notNull(),
        live: jsonb("live").$type<MatchLive>(),
        discord: jsonb("discord").$type<MatchDiscord>(),

        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
        deletedAt: timestamp("deleted_at", { withTimezone: true })
    },
    (table) => [
        index("matches_season_status_idx").on(table.seasonId, table.status),
        index("matches_players_gin").using("gin", table.players),
        check(
            "matches_live_phase_check",
            sql`live IS NULL OR jsonb_typeof(live->'phase') = 'string'`
        )
    ]
);


export const answers = pgTable(
    "answers",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        matchId: uuid("match_id")
            .notNull()
            .references(() => matches.id),
        questionId: uuid("question_id").notNull(),
        userId: uuid("user_id")
            .notNull()
            .references(() => users.id),

        value: jsonb("value").$type<AnswerValue>().notNull(),
        drafts: jsonb("drafts").$type<Drafts>(),
        firstAnsweredMs: integer("first_answered_ms"),
        answeredMs: integer("answered_ms"),

        autoMatched: boolean("auto_matched").notNull().default(false),
        judged: boolean("judged").notNull().default(false),
        verdict: verdict("verdict"),
        pointsAwarded: integer("points_awarded"),

        submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow()
    },
    (table) => [
        uniqueIndex("answers_upsert_unique").on(table.matchId, table.questionId, table.userId),
        index("answers_match_idx").on(table.matchId),
        check(
            "answers_value_object_check",
            sql`jsonb_typeof(value) = 'object' AND value <> '{}'::jsonb`
        )
    ]
);


export const matchResults = pgTable(
    "match_results",
    {
        matchId: uuid("match_id")
            .primaryKey()
            .references(() => matches.id),
        seasonId: uuid("season_id")
            .notNull()
            .references(() => seasons.id),
        results: jsonb("results").$type<ResultEntry[]>().notNull(),
        computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow()
    }
);


export const seasonStandings = pgTable(
    "season_standings",
    {
        seasonId: uuid("season_id")
            .notNull()
            .references(() => seasons.id),
        userId: uuid("user_id").references(() => users.id),
        teamId: uuid("team_id"),
        totalScore: integer("total_score").notNull(),
        rank: integer("rank").notNull(),
        placementPoints: integer("placement_points").notNull(),
        computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow()
    },
    (table) => [
        uniqueIndex("season_standings_user_unique")
            .on(table.seasonId, table.userId)
            .where(sql`team_id IS NULL`),
        uniqueIndex("season_standings_team_unique")
            .on(table.seasonId, table.teamId)
            .where(sql`user_id IS NULL`),
        check(
            "season_standings_one_identity_check",
            sql`(user_id IS NULL) <> (team_id IS NULL)`
        )
    ]
);

export const matchStats = pgTable(
    "match_stats",
    {
        matchId: uuid("match_id")
            .notNull()
            .references(() => matches.id),
        seasonId: uuid("season_id")
            .notNull()
            .references(() => seasons.id),
        roundId: text("round_id").notNull(),
        questionId: uuid("question_id"),
        userId: uuid("user_id").references(() => users.id),
        teamId: uuid("team_id"),

        tag: varchar("tag", { length: 64 }),
        basePoints: integer("base_points"),
        answered: boolean("answered"),
        correct: boolean("correct"),
        verdict: verdict("verdict"),
        pointsAwarded: integer("points_awarded"),
        firstAnsweredMs: integer("first_answered_ms"),
        answeredMs: integer("answered_ms"),
        pickOrder: integer("pick_order"),
        buzzMs: integer("buzz_ms"),
        buzzWon: boolean("buzz_won"),
        power: power("power")
    },
    (table) => [
        uniqueIndex("match_stats_member_unique")
            .on(table.matchId, table.roundId, table.questionId, table.userId)
            .where(sql`team_id IS NULL`),
        uniqueIndex("match_stats_team_unique")
            .on(table.matchId, table.roundId, table.teamId)
            .where(sql`user_id IS NULL`),
        index("match_stats_season_round_idx").on(table.seasonId, table.roundId),
        check(
            "match_stats_one_identity_check",
            sql`(user_id IS NULL) <> (team_id IS NULL)`
        ),
        check(
            "match_stats_question_grain_check",
            sql`(team_id IS NULL) = (question_id IS NOT NULL)`
        )
    ]
);

export const matchEvents = pgTable(
    "match_events",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        matchId: uuid("match_id")
            .notNull()
            .references(() => matches.id),
        questionId: uuid("question_id").notNull(),
        userId: uuid("user_id")
            .notNull()
            .references(() => users.id),
        roundId: text("round_id"),
        kind: matchEventKind("kind").notNull(),
        payload: jsonb("payload").$type<MatchEventPayload>().notNull(),
        at: timestamp("at", { withTimezone: true }).notNull().defaultNow()
    },
    (table) => [
        uniqueIndex("match_events_pick_unique")
            .on(table.matchId, table.questionId)
            .where(sql`kind = 'PICK'`),
        uniqueIndex("match_events_buzz_unique")
            .on(table.matchId, table.questionId, table.userId)
            .where(sql`kind = 'BUZZ'`),
        uniqueIndex("match_events_power_unique")
            .on(table.matchId, table.roundId, table.userId)
            .where(sql`kind = 'POWER'`),
        index("match_events_match_idx").on(table.matchId),
        check(
            "match_events_payload_kind_check",
            sql`payload->>'kind' = kind::text`
        ),
        check(
            "match_events_power_round_check",
            sql`kind <> 'POWER' OR round_id IS NOT NULL`
        )
    ]
);

// Live round state for an in-progress match. One row per live match.
// `version` is the optimistic-concurrency counter: every MC action must name the version
// it was based on, and a stale one is rejected (HTTP 409). `state` holds the round
// engine's pure state as JSON. Public match rows (`matches.live`) are unaffected.
export const matchLive = pgTable(
    "match_live",
    {
        matchId: uuid("match_id")
            .primaryKey()
            .references(() => matches.id, { onDelete: "cascade" }),
        version: integer("version").notNull().default(0),
        roundId: text("round_id").notNull(),
        state: jsonb("state").$type<Record<string, unknown>>().notNull(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
    },
    (table) => [
        check("match_live_version_check", sql`version >= 0`)
    ]
);
