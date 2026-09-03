import {
  pgTable,
  uuid,
  varchar,
  boolean,
  timestamp,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { roleEnum } from "./enums";

/**
 * Users table — v4 schema.
 *
 * Changes from v3:
 *   + google_id (nullable, unique) — Google OAuth subject
 *   + avatar_url (nullable) — Google profile picture
 *   - hashed_password — REMOVED (v4 uses Google OAuth only)
 *
 * The 'guest' value in roleEnum is kept in the DB for backward compat
 * but will not be assigned to new users.
 */
export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userSlug: varchar("user_slug", { length: 50 })
      .notNull()
      .unique()
      .$defaultFn(() => crypto.randomUUID()),
    googleId: varchar("google_id", { length: 255 }).unique(),
    email: varchar("email", { length: 255 }).notNull().unique(),
    userCode: varchar("user_code", { length: 50 }).notNull().unique(),
    userName: varchar("user_name", { length: 100 }).notNull(),
    avatarUrl: varchar("avatar_url", { length: 500 }),
    role: roleEnum("role").notNull().default("member"),
    isDeleted: boolean("is_deleted").default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    check(
      "check_user_code_starts_with_OC_U",
      sql`position('OC_U' in ${t.userCode}) = 1`,
    ),
  ],
);
