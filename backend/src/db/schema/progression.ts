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
    pgTable
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { seasons } from "./reference.js";
import { users } from "./auth.js";
import { verdict } from "./game.js";
import type { AnswerValue } from "../../game/contracts/index.js";

// Qualification is a phase, not a match: every enrolled player answers the same set, so
// there are no seats and no match row. Answers and the resulting ranking get their own
// season-scoped storage.

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
        submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow()
    },
    (table) => [
        primaryKey({ columns: [table.seasonId, table.phaseId, table.questionId, table.userId] }),
        index("season_phase_answers_phase_user_idx").on(table.seasonId, table.phaseId, table.userId),
        // A submitted answer always has content; the oral marker has no place here.
        check("season_phase_answers_object_check", sql`jsonb_typeof(value) = 'object' AND value <> '{}'::jsonb`)
    ]
);

// Written once, when the phase closes. The ranking is the phase's output, and the input
// to everything that follows.
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
        score: integer("score").notNull(),
        rank: integer("rank").notNull(),
        computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow()
    },
    (table) => [
        primaryKey({ columns: [table.seasonId, table.phaseId, table.userId] }),
        index("season_phase_results_rank_idx").on(table.seasonId, table.phaseId, table.rank)
    ]
);
