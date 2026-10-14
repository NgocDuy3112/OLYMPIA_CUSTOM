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
    pgTable,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";


export const userRole = pgEnum("user_role", ["ADMIN", "OPERATOR", "PLAYER"]);


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

        discordId: varchar("discord_id", { length: 30 }),

        passwordHash: text("password_hash"),
        totpSecret: text("totp_secret"),
        totpEnabledAt: timestamp("totp_enabled_at", { withTimezone: true }),
        totpLastUsedStep: integer("totp_last_used_step"),
        tokenVersion: integer("token_version").notNull().default(0),

        disabledAt: timestamp("disabled_at", { withTimezone: true }),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
    },
    (table) => [
        uniqueIndex("users_username_unique").on(table.username),
        uniqueIndex("users_email_unique").on(table.email),
        uniqueIndex("users_discord_id_unique").on(table.discordId),
        check(
            "users_role_identity_check",
            sql`(role = 'PLAYER' AND email IS NOT NULL) OR (role IN ('ADMIN', 'OPERATOR') AND username IS NOT NULL)`
        )
    ]
);

export const oauthAccounts = pgTable(
    "oauth_accounts",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        userId: uuid("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        provider: varchar("provider", { length: 32 }).notNull(),
        sub: text("sub").notNull(),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
    },
    (table) => [uniqueIndex("oauth_provider_sub_unique").on(table.provider, table.sub)]
);

export const mcpKeys = pgTable(
    "mcp_keys",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        userId: uuid("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),

        label: text("label").notNull(),
        prefix: varchar("prefix", { length: 20 }).notNull(),
        keyHash: text("key_hash").notNull(), 
        scopes: text("scopes").array().notNull().default(sql`'{READ}'`),

        expiresAt: timestamp("expires_at", { withTimezone: true }),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
        lastUsedAt: timestamp("last_used_at", { withTimezone: true }).notNull().defaultNow(),
        lastIp: varchar("last_ip", { length: 45 }),
        lastUserAgent: text("last_user_agent"),
        revokedAt: timestamp("revoked_at", { withTimezone: true })
    },
    (table) => [
        uniqueIndex("mcp_keys_key_hash_unique").on(table.keyHash),
        index("mcp_keys_user_idx").on(table.userId)
    ]
);