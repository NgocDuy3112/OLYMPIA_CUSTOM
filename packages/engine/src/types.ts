

export type MatchStatus =
  | "setup"
  | "active"
  | "in_progress"
  | "paused"
  | "completed"
  | "finished";


export interface ScoreDelta {
  userCode: string;
  points: number;
  reason: string;
}


export interface BroadcastPayload {
  type: string;
  [key: string]: unknown;
}


export interface QuestionState {
  questionCode: string;
  content: string;
  answer: string;
  mediaUrl?: string | null;
  options?: string[];
  isUsed: boolean;
}

export interface TimerState {
  timeLimit: number;
  startedAt: number;
  phase: string;
  isRunning: boolean;
}

export interface VeDichPower {
  userCode: string;
  power: "star" | "shield";
}

export interface BuzzerWinner {
  questionCode: string;
  userCode: string;
}


export interface ReplayPayload {
  type: string;
  [key: string]: unknown;
}

export type { TournamentEngine } from "./core/engine.js";
export type { Result, DomainEvent, DomainError } from "./core/result.js";
