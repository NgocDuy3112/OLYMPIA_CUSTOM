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
    check,
    pgEnum,
    pgTable,
    type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./auth.js";
import { 
    Media, 
    PlacementTier, 
    QuestionPayload, 
    TournamentRound, 
    Stage, 
    TournamentFormat, 
    RoundConfig
} from "../../game/contracts/index.js";


export const visibility = pgEnum("visibility", ["PUBLIC", "PRIVATE"]);
export const questionKind = pgEnum("question_kind", ["MC", "TEXT", "KEYWORD", "HINT"]);
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

        current: boolean("current").notNull().default(false),

        rounds: jsonb("rounds").$type<TournamentRound[]>().notNull(),
        format: jsonb("format").$type<TournamentFormat>().notNull(),
        placementTiers: jsonb("placement_tiers").$type<PlacementTier[]>().notNull(),
        stages: jsonb("stages").$type<Stage[]>().notNull(),

        // The rulebook the tournament is played on. Frozen once a match has been assembled,
        // so a running event never depends on later edits.
        roundRules: jsonb("round_rules").$type<Record<string, RoundConfig>>(),

        closedAt: timestamp("closed_at", { withTimezone: true }),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
        deletedAt: timestamp("deleted_at", { withTimezone: true })
    },
    (table) => [
        uniqueIndex("tournaments_slug_unique").on(table.slug),
        // One running tournament per owner.
        uniqueIndex("tournaments_current_unique")
            .on(table.ownerId)
            .where(sql`current = true`)
    ]
);

export const tournamentPlayers = pgTable(
    "tournament_players",
    {
        tournamentId: uuid("tournament_id")
            .notNull()
            .references(() => tournaments.id, { onDelete: "cascade" }),
        userId: uuid("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        enrolledAt: timestamp("enrolled_at", { withTimezone: true }).notNull().defaultNow()
    },
    (table) => [primaryKey({ columns: [table.tournamentId, table.userId] })]
);

export const questionBank = pgTable(
    "question_bank",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        kind: questionKind("kind").notNull(),
        questionText: text("question_text").notNull(),
        // The ve-dich board's category label — presentation only: no filtering,
        // no eligibility, no scoring. Copied into the match at assembly.
        domain: varchar("domain", { length: 64 }),
        // A hint belongs to exactly one keyword: the set it lives under.
        keywordId: uuid("keyword_id").references((): AnyPgColumn => questionBank.id),
        media: jsonb("media").$type<Media>(), 
        payload: jsonb("payload").$type<QuestionPayload>().notNull(),
        timeLimit: integer("time_limit"),
        status: questionStatus("status").notNull().default("DRAFT"),

        createdBy: uuid("created_by")
            .notNull()
            .references(() => users.id),

        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
    },
    (table) => [
        index("question_bank_status_idx").on(table.status),
        index("question_bank_keyword_idx").on(table.keywordId),
        // Containment lives in the database: a HINT without its keyword cannot exist.
        check("question_bank_hint_needs_keyword", sql`kind <> 'HINT' OR keyword_id IS NOT NULL`)
    ]
);