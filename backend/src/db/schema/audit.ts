import {
    uuid,
    varchar,
    text,
    timestamp,
    jsonb,
    index,
    pgTable,
} from "drizzle-orm/pg-core";
import { users } from "./auth.js";
import { matches } from "./game.js";


export const auditEvents = pgTable(
    "audit_events",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
        targetId: uuid("target_id").references(() => users.id, { onDelete: "set null" }),
        action: varchar("action", { length: 100 }).notNull(),
        matchId: uuid("match_id").references(() => matches.id, { onDelete: "set null" }),
        details: jsonb("details"),
        ip: varchar("ip", { length: 45 }),
        userAgent: text("user_agent"),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
    },
    (table) => [
        index("audit_events_actor_idx").on(table.actorId),
        index("audit_events_target_idx").on(table.targetId),
        index("audit_events_match_idx").on(table.matchId)
    ]
);