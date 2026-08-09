/**
 * Core types for the game engine.
 *
 * This file contains ALL shared types — no runtime imports,
 * pure TypeScript definitions only.
 */

// ── Phases ──

export type Phase =
  | 'kdc'   // Khởi Động Chung (group warm-up)
  | 'kdr'   // Khởi Động Cá Nhân (individual warm-up)
  | 'bp'    // Bứt Phá (buzzer sprint)
  | 'vdc'   // Về Đích Chung (group final)
  | 'vdr'   // Về Đích Cá Nhân (individual final)
  | 'gm'    // Giải Mã (decode)
  | 'vl'    // Vòng Loại (qualifier) — NOT included in this engine

export const ALL_PHASES: Phase[] = ['kdc', 'kdr', 'bp', 'vdc', 'vdr', 'gm']

// ── Match status ──

export type MatchStatus = 'setup' | 'active' | 'in_progress' | 'paused' | 'completed' | 'finished'

// ── Player action ──

export interface PlayerAction {
  type: string
  userCode: string
  matchCode: string
  phase: Phase
  payload: Record<string, unknown>
}

// ── Score delta ──

export interface ScoreDelta {
  userCode: string
  points: number
  reason: string
}

// ── Broadcast payload ──

export interface BroadcastPayload {
  type: string
  [key: string]: unknown
}

// ── Game state ──

export interface QuestionState {
  questionCode: string
  content: string
  answer: string
  mediaUrl?: string | null
  options?: string[]
  isUsed: boolean
}

export interface TimerState {
  timeLimit: number
  startedAt: number
  phase: string
  isRunning: boolean
}

export interface VeDichPower {
  userCode: string
  power: 'star' | 'shield'
}

export interface BuzzerWinner {
  questionCode: string
  userCode: string
}

export interface GameState {
  matchCode: string
  currentPhase: Phase | null
  currentQuestion: QuestionState | null
  timer: TimerState | null

  // Per-question tracking
  answers: Record<string, string>  // userCode → answer text
  buzzTimestamps: Record<string, number>  // userCode → timestamp ms
  buzzOrder: string[]  // ordered list of user codes who buzzed

  // Buzzer
  buzzerWinners: BuzzerWinner[]

  // VeDich
  veDichTurnPlayer: string | null
  veDichPowers: VeDichPower[]
  veDichQuestionStates: Record<string, { answered: boolean; correct: boolean }>

  // Giải Mã
  gmAdminState: {
    activeClueIndex: number | null
    clueStates: string[]
    revealedHints: Record<number, { text: string | null; mediaUrl: string | null }>
    keywordPhaseActive: boolean
    keywordAnswerRevealed: boolean
  }
  gmPlayerStates: Record<string, { keyword: string; cluesOpened: number }>
  gmHints: Record<number, { text: string | null; mediaUrl: string | null; targetPlayers: string[] }>

  // KDR tracking (attempts per question per player)
  kdrAttempts: Record<string, number>  // `${questionCode}:${userCode}` → attempt count
}

// ── Phase start/end results ──

export interface PhaseStartResult {
  phase: Phase
  broadcasts: BroadcastPayload[]
  state: Partial<GameState>
}

export interface PhaseEndResult {
  phase: Phase
  broadcasts: BroadcastPayload[]
  scoreDeltas: ScoreDelta[]
}

// ── Reconnect snapshot ──

export interface ReplayPayload {
  type: string
  [key: string]: unknown
}

// ── Engine interface ──

export interface TournamentEngine {
  readonly id: string
  readonly name: string

  initMatch(matchCode: string): GameState
  startPhase(state: GameState, phase: Phase): PhaseStartResult
  endPhase(state: GameState, phase: Phase): PhaseEndResult

  handleAction(state: GameState, action: PlayerAction): {
    state: GameState
    broadcasts: BroadcastPayload[]
    scoreDeltas: ScoreDelta[]
  }

  canBuzz(state: GameState, userCode: string): boolean
  canSubmit(state: GameState, userCode: string): boolean
  canAdvance(state: GameState): boolean

  calculateScore(action: PlayerAction, state: GameState): ScoreDelta[]
  getSnapshotForReconnect(state: GameState, userCode: string): ReplayPayload[]
}
