import {
    uuid,
    boolean,
    jsonb,
    integer,
    varchar,
    text,
    timestamp,
    uniqueIndex,
    primaryKey,
    index,
    pgEnum,
    pgTable,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./auth.js";
import { 
    Media, 
    PlacementTier, 
    QuestionPayload, 
    SeasonRound, 
    Stage, 
    TournamentFormat 
} from "../../game/contracts/index.js";


export const visibility = pgEnum("visibility", ["PUBLIC", "PRIVATE"]);
export const questionKind = pgEnum("question_kind", ["MC", "TEXT", "KEYWORD"]);
export const questionStatus = pgEnum("question_status", ["DRAFT", "PENDING", "PUBLISHED", "ARCHIVED"]);


export const tournaments = pgTable(
    "tournaments",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        name: text("name").notNull(),
        slug: varchar("slug", { length: 100 }).notNull(),
        visibility: visibility("visibility").notNull().default("PUBLIC"),
        ownerId: uuid("owner_id")
            .notNull()
            .references(() => users.id),

        defaultTags: text("default_tags").array().notNull(),
        defaultRounds: jsonb("default_rounds").$type<SeasonRound[]>().notNull(),
        defaultFormat: jsonb("default_format").$type<TournamentFormat>().notNull(),
        defaultPlacementTiers: jsonb("default_placement_tiers").$type<PlacementTier[]>().notNull(),

        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
        deletedAt: timestamp("deleted_at", { withTimezone: true })
    },
    (table) => [uniqueIndex("tournaments_slug_unique").on(table.slug)]
);

export const seasons = pgTable(
    "seasons",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        tournamentId: uuid("tournament_id")
            .notNull()
            .references(() => tournaments.id),
        name: text("name").notNull(),
        current: boolean("current").notNull().default(false),

        rounds: jsonb("rounds").$type<SeasonRound[]>().notNull(),
        format: jsonb("format").$type<TournamentFormat>().notNull(),
        placementTiers: jsonb("placement_tiers").$type<PlacementTier[]>().notNull(),
        stages: jsonb("stages").$type<Stage[]>().notNull(),

        closedAt: timestamp("closed_at", { withTimezone: true }),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
        deletedAt: timestamp("deleted_at", { withTimezone: true })
    },
    (table) => [
        uniqueIndex("seasons_current_unique")
            .on(table.tournamentId)
            .where(sql`current = true`)
    ]
);

export const seasonPlayers = pgTable(
    "season_players",
    {
        seasonId: uuid("season_id")
            .notNull()
            .references(() => seasons.id, { onDelete: "cascade" }),
        userId: uuid("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        enrolledAt: timestamp("enrolled_at", { withTimezone: true }).notNull().defaultNow()
    },
    (table) => [primaryKey({ columns: [table.seasonId, table.userId] })]
);

export const questionBank = pgTable(
    "question_bank",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        kind: questionKind("kind").notNull(),
        questionText: text("question_text").notNull(),
        tag: varchar("tag", { length: 64 }).notNull(),
        media: jsonb("media").$type<Media>(), 
        payload: jsonb("payload").$type<QuestionPayload>().notNull(),
        timeLimit: integer("time_limit"),
        status: questionStatus("status").notNull().default("DRAFT"),

        tournamentId: uuid("tournament_id").references(() => tournaments.id),
        createdBy: uuid("created_by")
            .notNull()
            .references(() => users.id),

        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
    },
    (table) => [
        index("question_bank_status_idx").on(table.status),
        index("question_bank_tag_idx").on(table.tag)
    ]
);