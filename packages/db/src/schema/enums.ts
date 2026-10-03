import { pgEnum } from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("roleenum", [
  "admin",
  "operator",
  "agent",
  "player",
  "spectator",
  "controller",
  "member",
]);
export const matchStatusEnum = pgEnum("matchstatusenum", [
  "setup",
  "active",
  "in_progress",
  "paused",
  "completed",
  "finished",
]);

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
