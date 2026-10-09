import {
    uuid,
    boolean,
    check,
    integer,
    varchar,
    text,
    timestamp,
    uniqueIndex,
    index,
    pgEnum,
    pgTable
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";


export const userRole = pgEnum("user_role", ["admin", "operator", "player"])


export const users = pgTable(
    "users",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        role: userRole("role").notNull(),
        username: varchar("username", { length: 50 }),
        email: varchar("email", { length: 255 }),
        emailVerified: boolean("email_verified").notNull().default(false),
        displayName: varchar("display_name", { length: 100 }).notNull(),
        avatarUrl: text("avatar_url"),

        passwordHash: text("password_hash"),
        totpSecret: text("totp_secret"),
        totpEnabledAt: timestamp("totp_enabled_at", { withTimezone: true }),
        totpLastUsedStep: integer("totp_last_used_step"),
        tokenVersion: integer("token_version").notNull().default(0),

        disabledAt: timestamp("disabled_at", { withTimezone: true }),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
        uniqueIndex("users_username_unique").on(table.username),
        uniqueIndex("users_email_unique").on(table.email),
        check(
            "users_role_identity_check",
            sql`(role = 'player' AND email IS NOT NULL) OR (role IN ('admin', 'operator') AND username IS NOT NULL)`
        ),
    ]
)


export const oauthAccounts = pgTable(
    "oauth_accounts",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        userId: uuid("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        provider: varchar("provider", { length: 32 }).notNull(),
        sub: text("sub").notNull(),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
        uniqueIndex("oauth_provider_sub_unique").on(table.provider, table.sub),
    ]
);


export const auditEvents = pgTable(
    "audit_events",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
        targetId: uuid("target_id").references(() => users.id, { onDelete: "set null" }),
        action: varchar("action", { length: 100 }).notNull(),
        ip: varchar("ip", { length: 45 }),
        userAgent: text("user_agent"),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
        index("audit_events_actor_idx").on(table.actorId),
        index("audit_events_target_idx").on(table.targetId),
    ]
);