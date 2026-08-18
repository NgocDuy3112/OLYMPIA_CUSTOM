export type TournamentFormat = "oc3" | "oc4" | "ochcmc";

export interface GameEvent {
  type: string;
  matchCode: string;
  [key: string]: unknown;
}
