import {
  pgTable,
  uuid,
  varchar,
  boolean,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./user";

/**
 * Tournament templates define reusable tournament structures.
 * Config is stored as JSONB for flexibility.
 */
export const tournamentTemplates = pgTable(
  "tournament_templates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    templateName: varchar("template_name", { length: 100 }).notNull(),
    templateType: varchar("template_type", { length: 50 }).notNull(),
    description: varchar("description", { length: 500 }),
    config: jsonb("config").notNull(),
    isSystem: boolean("is_system").notNull().default(false),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index("idx_templates_type").on(t.templateType),
    index("idx_templates_system").on(t.isSystem),
  ],
);

/**
 * Template config structure:
 *
 * Individual format (OC3, OC4):
 * {
 *   "type": "individual",
 *   "playersPerMatch": 4,
 *   "phases": [
 *     { "name": "Group Stage", "type": "group_stage", "rounds": 2 },
 *     { "name": "Playoffs", "type": "playoffs", "matches": 4 }
 *   ],
 *   "tiers": ["S", "A", "B", "C"],
 *   "advancementRules": [
 *     { "from": "M09", "rank": 1, "to": "M19" }
 *   ]
 * }
 *
 * Team format (OC HCMC):
 * {
 *   "type": "team",
 *   "playersPerTeam": 2,
 *   "teamsPerMatch": 2,
 *   "phases": [
 *     { "name": "Group Stage", "type": "group_stage", "rounds": 2 },
 *     { "name": "Semi Finals", "type": "playoffs", "matches": 2 },
 *     { "name": "Grand Finale", "type": "finale", "matches": 1 }
 *   ]
 * }
 */
