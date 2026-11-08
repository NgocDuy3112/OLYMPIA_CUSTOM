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
    QuestionPayload, 
    TournamentRound, 
    Stage, 
    TournamentFormat, 
    RoundConfig
} from "../../game/contracts/index.js";


export const visibility = pgEnum("visibility", ["PUBLIC", "PRIVATE"]);
export const questionKind = pgEnum("question_kind", ["CHOICE", "TEXT", "KEYWORD", "HINT"]);
export const questionStatus = pgEnum("question_status", ["DRAFT", "PENDING", "PUBLISHED", "ARCHIVED"]);
export const playerGroup = pgEnum("player_group", ["A", "B"]);


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
        stages: jsonb("stages").$type<Stage[]>().notNull(),

        roundRules: jsonb("round_rules").$type<Record<string, RoundConfig>>(),

        closedAt: timestamp("closed_at", { withTimezone: true }),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
        deletedAt: timestamp("deleted_at", { withTimezone: true })
    },
    (table) => [
        uniqueIndex("tournaments_slug_unique").on(table.slug),
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
        group: playerGroup("group"),
        enrolledAt: timestamp("enrolled_at", { withTimezone: true }).notNull().defaultNow()
    },
    (table) => [primaryKey({ columns: [table.tournamentId, table.userId] })]
);

export interface SourceCells {
    question: string;
    answer: string;
    explanation: string;
    note: string;
    media: string;
}

export const questionImportBatches = pgTable(
    "question_import_batches",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
        sourceName: text("source_name"),
        rowCount: integer("row_count").notNull().default(0),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
    }
);

export const questionImportRows = pgTable(
    "question_import_rows",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        batchId: uuid("batch_id")
            .notNull()
            .references((): AnyPgColumn => questionImportBatches.id, { onDelete: "cascade" }),
        position: integer("position").notNull(),
        sheet: text("sheet").notNull(),
        sourceId: text("source_id").notNull(),
        cells: jsonb("cells").$type<SourceCells>().notNull(),
        media: jsonb("media").$type<Media>(),
        error: text("error"),
        warning: text("warning"),
        dropped: boolean("dropped").notNull().default(false),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
    },
    (table) => [uniqueIndex("question_import_rows_batch_pos").on(table.batchId, table.position)]
);

export const questionBank = pgTable(
    "question_bank",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        kind: questionKind("kind").notNull(),
        questionText: text("question_text").notNull(),
        keywordId: uuid("keyword_id").references((): AnyPgColumn => questionBank.id),
        media: jsonb("media").$type<Media>(), 
        payload: jsonb("payload").$type<QuestionPayload>().notNull(),
        timeLimit: integer("time_limit"),
        status: questionStatus("status").notNull().default("DRAFT"),

        tags: text("tags").array().notNull().default(sql`'{}'`),
        type: text("type").generatedAlwaysAs(sql`(payload ->> 'type')`).notNull(),

        createdBy: uuid("created_by")
            .notNull()
            .references(() => users.id),
        importBatchId: uuid("import_batch_id").references(
            () => questionImportBatches.id,
            { onDelete: "set null" }
        ),

        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
    },
    (table) => [
        index("question_bank_status_idx").on(table.status),
        index("question_bank_keyword_idx").on(table.keywordId),
        check("question_bank_hint_needs_keyword", sql`kind <> 'HINT' OR keyword_id IS NOT NULL`)
    ]
);
