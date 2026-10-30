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
    pgTable,
    primaryKey
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { tournaments } from "./reference.js";
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

// A match is played for points.
export const matchKind = pgEnum("match_kind", ["STANDARD"]);


export const matches = pgTable(
    "matches",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        tournamentId: uuid("tournament_id")
            .notNull()
            .references(() => tournaments.id),
        stageId: text("stage_id").notNull(),
        scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
        label: text("label").notNull(),
        status: matchStatus("status").notNull().default("UPCOMING"),
        kind: matchKind("kind").notNull().default("STANDARD"),
        slot: integer("slot"),
        // The player's door in: staff read this code off the match page, players
        // type it on /join to pick a seat and get a session (no password).
        joinCode: text("join_code"),
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
        index("matches_tournament_status_idx").on(table.tournamentId, table.status),
        index("matches_players_gin").using("gin", table.players),
        uniqueIndex("matches_stage_slot_unique")
            .on(table.tournamentId, table.stageId, table.slot)
            .where(sql`deleted_at IS NULL AND slot IS NOT NULL`),
        uniqueIndex("matches_join_code_unique")
            .on(table.joinCode)
            .where(sql`join_code IS NOT NULL AND deleted_at IS NULL`),
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
        tournamentId: uuid("tournament_id")
            .notNull()
            .references(() => tournaments.id),
        results: jsonb("results").$type<ResultEntry[]>().notNull(),
        computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow()
    }
);

// The controller's manual score corrections — an append-only, audited ledger at
// MATCH level (round engines keep their own points untouched). Rows fold into
// the live scoreboard (scoreTable) and the frozen results (scoring.ts).
export const scoreAdjustments = pgTable(
    "score_adjustments",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        matchId: uuid("match_id").notNull().references(() => matches.id),
        userId: uuid("user_id").notNull().references(() => users.id),
        delta: integer("delta").notNull(),
        reason: varchar("reason", { length: 200 }).notNull(),
        createdBy: uuid("created_by").references(() => users.id),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
    },
    (table) => [
        index("score_adjustments_match_user_idx").on(table.matchId, table.userId)
    ]
);


export const tournamentStandings = pgTable(
    "tournament_standings",
    {
        tournamentId: uuid("tournament_id")
            .notNull()
            .references(() => tournaments.id),
        userId: uuid("user_id").references(() => users.id),
        teamId: uuid("team_id"),
        rank: integer("rank").notNull(),
        placementPoints: integer("placement_points").notNull(),
        computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow()
    },
    (table) => [
        uniqueIndex("tournament_standings_user_unique")
            .on(table.tournamentId, table.userId)
            .where(sql`team_id IS NULL`),
        uniqueIndex("tournament_standings_team_unique")
            .on(table.tournamentId, table.teamId)
            .where(sql`user_id IS NULL`),
        check(
            "tournament_standings_one_identity_check",
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
        tournamentId: uuid("tournament_id")
            .notNull()
            .references(() => tournaments.id),
        roundId: text("round_id").notNull(),
        questionId: uuid("question_id"),
        userId: uuid("user_id").references(() => users.id),
        teamId: uuid("team_id"),

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
        index("match_stats_tournament_round_idx").on(table.tournamentId, table.roundId),
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
        // One HOPE and one SHIELD per player across all of ve-dich — so the key is the
        // power itself, not the round. The old key allowed only one power per round.
        uniqueIndex("match_events_power_unique")
            .on(table.matchId, table.userId, sql`(payload->>'power')`)
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
        // Rounds the controller has left — kept per round so any round can be
        // re-opened later (no one-way doors for the MC).
        archive: jsonb("archive").$type<Record<string, Record<string, unknown>>>().notNull().default(sql`'{}'::jsonb`),
        updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
    },
    (table) => [
        check("match_live_version_check", sql`version >= 0`)
    ]
);
