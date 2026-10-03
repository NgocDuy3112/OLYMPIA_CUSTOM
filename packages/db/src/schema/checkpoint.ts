import {
  pgTable,
  uuid,
  varchar,
  jsonb,
  timestamp,
  index,
  foreignKey,
} from "drizzle-orm/pg-core";
import { matches } from "./match.js";

export const matchCheckpoints = pgTable(
  "match_checkpoints",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    matchCode: varchar("match_code", { length: 50 }).notNull(),
    checkpoint: jsonb("checkpoint").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index("idx_checkpoint_match_time").on(t.matchCode, t.createdAt),
    foreignKey({
      columns: [t.matchCode],
      foreignColumns: [matches.matchCode],
      name: "fk_checkpoint_match_code",
    }).onDelete("cascade"),
  ],
);
