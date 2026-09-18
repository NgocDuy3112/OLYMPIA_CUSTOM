import { pgEnum } from "drizzle-orm/pg-core";

// ── Role enum (global) ──
// Global roles: admin (full access), operator (staff with scopes),
// player (contestant), spectator (view only).
// Operator scopes (question_creator/controller/mc) live in users.operator_scopes.
export const roleEnum = pgEnum("roleenum", [
  "admin",
  "operator",
  "player",
  "spectator",
  // Backward compat — do not assign to new users:
  "controller",
  "member",
]);
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
