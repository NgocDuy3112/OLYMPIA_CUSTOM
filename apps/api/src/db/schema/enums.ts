import { pgEnum } from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("roleenum", [
  "ADMIN",
  "OPERATOR",
  "PLAYER",
  "CONTROLLER"
]);

export const matchStatusEnum = pgEnum("matchstatusenum", [
  "SETUP",
  "ACTIVE",
  "PAUSED",
  "FINISHED"
]);
