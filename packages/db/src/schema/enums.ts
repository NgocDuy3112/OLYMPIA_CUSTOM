import { pgEnum } from "drizzle-orm/pg-core";

// ── Role enum (global) ──
// Global roles determine platform-level access.
// Per-tournament roles (controller, mc, player) are in tournament_players table.
export const roleEnum = pgEnum("roleenum", ["admin", "member", "spectator"]);

// ── Match status enum ──
export const matchStatusEnum = pgEnum("matchstatusenum", [
  "setup",
  "active",
  "in_progress",
  "paused",
  "completed",
  "finished",
]);

// ── Audit action type enum ──
export const auditActionTypeEnum = pgEnum("auditactiontype", [
  "LOGIN",
  "LOGOUT",
  "SCORE_CHANGE",
  "MATCH_STATE_CHANGE",
  "PLAYER_JOIN",
  "PLAYER_LEAVE",
  "QUESTION_USED",
  "MATCH_CREATED",
  "MATCH_DELETED",
]);
