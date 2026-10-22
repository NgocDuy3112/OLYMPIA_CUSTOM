import {
    uuid,
    integer,
    boolean,
    jsonb,
    text,
    timestamp,
    primaryKey,
    index,
    check,
    pgTable,
    uniqueIndex
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { seasons } from "./reference.js";
import { users } from "./auth.js";
import { verdict } from "./game.js";
import type { AnswerValue } from "../../game/contracts/index.js";



export const seasonPhaseAnswers = pgTable(
    "season_phase_answers",
    {
        seasonId: uuid("season_id")
            .notNull()
            .references(() => seasons.id, { onDelete: "cascade" }),
        phaseId: text("phase_id").notNull(),               // e.g. "qualification"
        questionId: uuid("question_id").notNull(),         // frozen copy's _id
        userId: uuid("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),

        value: jsonb("value").$type<AnswerValue>().notNull(),
        verdict: verdict("verdict"),
        autoMatched: boolean("auto_matched").notNull().default(false),
        pointsAwarded: integer("points_awarded").notNull().default(0),
        answeredMs: integer("answered_ms"),
        submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow()
    },
    (table) => [
        primaryKey({ columns: [table.seasonId, table.phaseId, table.questionId, table.userId] }),
        index("season_phase_answers_phase_user_idx").on(table.seasonId, table.phaseId, table.userId),
        check("season_phase_answers_object_check", sql`jsonb_typeof(value) = 'object' AND value <> '{}'::jsonb`)
    ]
);

// The server's own clock for a phase. It exists so answer times are measured by the
// server (receive time), never taken on the client's word: openedAt is when the player
// first fetched the phase, lastAnswerAt is when their previous answer landed.
export const seasonPhaseClocks = pgTable(
    "season_phase_clocks",
    {
        seasonId: uuid("season_id")
            .notNull()
            .references(() => seasons.id, { onDelete: "cascade" }),
        phaseId: text("phase_id").notNull(),
        userId: uuid("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),

        openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
        lastAnswerAt: timestamp("last_answer_at", { withTimezone: true })
    },
    (table) => [
        primaryKey({ columns: [table.seasonId, table.phaseId, table.userId] })
    ]
);

export const seasonPhaseResults = pgTable(
    "season_phase_results",
    {
        seasonId: uuid("season_id")
            .notNull()
            .references(() => seasons.id, { onDelete: "cascade" }),
        phaseId: text("phase_id").notNull(),
        userId: uuid("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        score: integer("score").notNull(),           // crowd-weighted points
        correctCount: integer("correct_count").notNull().default(0),
        round: integer("round").notNull().default(1),
        avgTimeMs: integer("avg_time_ms"),
        rank: integer("rank").notNull(),
        computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow()
    },
    (table) => [
        primaryKey({ columns: [table.seasonId, table.phaseId, table.userId, table.round] }),
        index("season_phase_results_rank_idx").on(table.seasonId, table.phaseId, table.rank)
    ]
);

export const matchDraws = pgTable(
    "match_draws",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        seasonId: uuid("season_id")
            .notNull()
            .references(() => seasons.id, { onDelete: "cascade" }),

        stageId: text("stage_id").notNull(),               // "splitting-1", "ladder-2", …
        seed: text("seed").notNull(),                      // hex; replayed with rngFromSeed
        groups: jsonb("groups").$type<string[][]>().notNull(),
        questions: jsonb("questions").$type<unknown[]>().notNull(),  // frozen AssemblyEntry[]

        drawnBy: uuid("drawn_by")
            .notNull()
            .references(() => users.id),
        drawnAt: timestamp("drawn_at", { withTimezone: true }).notNull().defaultNow()
    },
    (table) => [
        uniqueIndex("match_draws_stage_unique").on(table.seasonId, table.stageId)
    ]
);