import type {
  BroadcastPayload,
  BuzzerWinner,
  QuestionState,
  ReplayPayload,
  ScoreDelta,
  TimerState,
  VeDichPower,
} from "../types.js";

export type OC3Phase = "kdc" | "kdr" | "bp" | "vdc" | "vdr" | "gm";

export interface OC3Action {
  type: string;
  userCode: string;
  matchCode: string;
  phase: OC3Phase;
  payload: Record<string, unknown>;
}

export interface OC3State {
  matchCode: string;
  currentPhase: OC3Phase | null;
  currentQuestion: QuestionState | null;
  timer: TimerState | null;
  answers: Record<string, string>;
  kdcAnswered: Record<string, boolean>;
  afkPlayers: Record<string, boolean>;
  buzzTimestamps: Record<string, number>;
  buzzOrder: string[];
  buzzerWinners: BuzzerWinner[];
  veDichTurnPlayer: string | null;
  veDichPowers: VeDichPower[];
  veDichQuestionStates: Record<string, { answered: boolean; correct: boolean }>;
  gmAdminState: {
    activeClueIndex: number | null;
    clueStates: string[];
    revealedHints: Record<
      number,
      { text: string | null; mediaUrl: string | null }
    >;
    keywordPhaseActive: boolean;
    keywordAnswerRevealed: boolean;
  };
  gmPlayerStates: Record<string, { keyword: string; cluesOpened: number }>;
  gmHints: Record<
    number,
    { text: string | null; mediaUrl: string | null; targetPlayers: string[] }
  >;
  kdrAttempts: Record<string, number>;
}

export interface OC3ActionResult {
  state: OC3State;
  broadcasts: BroadcastPayload[];
  scoreDeltas: ScoreDelta[];
}

export type OC3ReplayPayload = ReplayPayload;
