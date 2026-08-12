/**
 * OC3 Engine — OC 3.
 *
 * Pure game logic — no WebSocket, no DB, no Valkey.
 * Backward compatible with existing OC3 data.
 */

import type {
  TournamentEngine,
  GameState,
  Phase,
  PlayerAction,
  PhaseStartResult,
  PhaseEndResult,
  ScoreDelta,
  BroadcastPayload,
  ReplayPayload,
} from '../types.js'
import { OC3_CONFIG } from './config.js'
import {
  kdcCorrect,
  kdrCorrect,
  kdrWrong,
  gmClueCorrect,
  gmKeywordCorrect,
  vdrScore,
  vdcResolve,
  bpResolve,
  applyVeDichPower,
} from '../base/scoring.js'

export class OC3Engine implements TournamentEngine {
  readonly id: string = OC3_CONFIG.id
  readonly name: string = OC3_CONFIG.name

  // ── Init ──

  initMatch(matchCode: string): GameState {
    return {
      matchCode,
      currentPhase: null,
      currentQuestion: null,
      timer: null,
      answers: {},
      buzzTimestamps: {},
      buzzOrder: [],
      buzzerWinners: [],
      veDichTurnPlayer: null,
      veDichPowers: [],
      veDichQuestionStates: {},
      gmAdminState: {
        activeClueIndex: null,
        clueStates: Array(8).fill('idle'),
        revealedHints: {},
        keywordPhaseActive: false,
        keywordAnswerRevealed: false,
      },
      gmPlayerStates: {},
      gmHints: {},
      kdrAttempts: {},
    }
  }

  // ── Phase transitions ──

  startPhase(state: GameState, phase: Phase): PhaseStartResult {
    // Clear round-specific state
    const newState: GameState = {
      ...state,
      currentPhase: phase,
      currentQuestion: null,
      timer: null,
      answers: {},
      buzzTimestamps: {},
      buzzOrder: [],
    }

    const broadcasts: BroadcastPayload[] = [
      { type: 'round_start', phase, match_code: state.matchCode },
    ]

    // Phase-specific init
    if (phase === 'gm') {
      newState.gmAdminState = {
        activeClueIndex: null,
        clueStates: Array(8).fill('idle'),
        revealedHints: {},
        keywordPhaseActive: false,
        keywordAnswerRevealed: false,
      }
      newState.gmPlayerStates = {}
      newState.gmHints = {}
    }

    return { phase, broadcasts, state: newState }
  }

  endPhase(state: GameState, phase: Phase): PhaseEndResult {
    const broadcasts: BroadcastPayload[] = [
      { type: 'round_end', phase, match_code: state.matchCode },
    ]

    return { phase, broadcasts, scoreDeltas: [] }
  }

  // ── Action handling ──

  handleAction(state: GameState, action: PlayerAction): {
    state: GameState
    broadcasts: BroadcastPayload[]
    scoreDeltas: ScoreDelta[]
  } {
    switch (action.type) {
      case 'buzz':
        return this.handleBuzz(state, action)
      case 'answer':
      case 'player_answer':
        return this.handleAnswer(state, action)
      case 'send_question':
        return this.handleSendQuestion(state, action)
      case 'start_the_timer':
        return this.handleStartTimer(state, action)
      case 'clear_question':
        return this.handleClearQuestion(state, action)
      case 'vd_player_power':
        return this.handleVeDichPower(state, action)
      case 'keyword_submit':
        return this.handleKeywordSubmit(state, action)
      default:
        return { state, broadcasts: [], scoreDeltas: [] }
    }
  }

  // ── Action handlers ──

  private handleBuzz(state: GameState, action: PlayerAction): {
    state: GameState; broadcasts: BroadcastPayload[]; scoreDeltas: ScoreDelta[]
  } {
    const { userCode } = action
    const now = Date.now()

    if (state.buzzTimestamps[userCode]) {
      // Already buzzed — ignore
      return { state, broadcasts: [], scoreDeltas: [] }
    }

    const newState = {
      ...state,
      buzzTimestamps: { ...state.buzzTimestamps, [userCode]: now },
      buzzOrder: [...state.buzzOrder, userCode],
    }

    return {
      state: newState,
      broadcasts: [{
        type: 'buzz',
        user_code: userCode,
        match_code: state.matchCode,
        timestamp: now,
      }],
      scoreDeltas: [],
    }
  }

  private handleAnswer(state: GameState, action: PlayerAction): {
    state: GameState; broadcasts: BroadcastPayload[]; scoreDeltas: ScoreDelta[]
  } {
    const { userCode, payload } = action
    const answer = (payload.answer as string) || ''

    const newState = {
      ...state,
      answers: { ...state.answers, [userCode]: answer },
    }

    const broadcasts: BroadcastPayload[] = [{
      type: 'player_answer',
      user_code: userCode,
      match_code: state.matchCode,
      answer,
    }]

    return { state: newState, broadcasts, scoreDeltas: [] }
  }

  private handleSendQuestion(state: GameState, action: PlayerAction): {
    state: GameState; broadcasts: BroadcastPayload[]; scoreDeltas: ScoreDelta[]
  } {
    const { payload } = action
    const question = {
      questionCode: (payload.question_code as string) || '',
      content: (payload.content as string) || '',
      answer: (payload.answer as string) || '',
      mediaUrl: payload.media_source as string | null,
      isUsed: true,
    }

    return {
      state: { ...state, currentQuestion: question },
      broadcasts: [],
      scoreDeltas: [],
    }
  }

  private handleStartTimer(state: GameState, action: PlayerAction): {
    state: GameState; broadcasts: BroadcastPayload[]; scoreDeltas: ScoreDelta[]
  } {
    const { payload } = action
    const timer = {
      timeLimit: Number(payload.time_limit) || 30,
      startedAt: Number(payload.started_at) || Date.now(),
      phase: (payload.phase as string) || state.currentPhase || '',
      isRunning: true,
    }
    return {
      state: { ...state, timer },
      broadcasts: [],
      scoreDeltas: [],
    }
  }

  private handleClearQuestion(state: GameState, _action: PlayerAction): {
    state: GameState; broadcasts: BroadcastPayload[]; scoreDeltas: ScoreDelta[]
  } {
    return {
      state: {
        ...state,
        currentQuestion: null,
        timer: null,
        answers: {},
        buzzTimestamps: {},
        buzzOrder: [],
      },
      broadcasts: [],
      scoreDeltas: [],
    }
  }

  private handleVeDichPower(state: GameState, action: PlayerAction): {
    state: GameState; broadcasts: BroadcastPayload[]; scoreDeltas: ScoreDelta[]
  } {
    const { userCode, payload } = action
    const power = payload.power as 'star' | 'shield'
    if (power !== 'star' && power !== 'shield') {
      return { state, broadcasts: [], scoreDeltas: [] }
    }

    // Check if player already used a power
    if (state.veDichPowers.some((p) => p.userCode === userCode)) {
      return { state, broadcasts: [], scoreDeltas: [] }
    }

    const newState = {
      ...state,
      veDichPowers: [...state.veDichPowers, { userCode, power }],
    }

    return {
      state: newState,
      broadcasts: [{
        type: 'vd_powers_used',
        used_powers: Object.fromEntries(newState.veDichPowers.map((p) => [p.userCode, p.power])),
      }],
      scoreDeltas: [],
    }
  }

  private handleKeywordSubmit(state: GameState, action: PlayerAction): {
    state: GameState; broadcasts: BroadcastPayload[]; scoreDeltas: ScoreDelta[]
  } {
    const { userCode, payload } = action
    const keyword = (payload.keyword_text as string) || ''
    const cluesOpened = Number(payload.clues_opened) || 0

    const newState = {
      ...state,
      gmPlayerStates: {
        ...state.gmPlayerStates,
        [userCode]: { keyword, cluesOpened },
      },
    }

    return {
      state: newState,
      broadcasts: [{
        type: 'keyword_submit',
        user_code: userCode,
        keyword_text: keyword,
        clues_opened: cluesOpened,
      }],
      scoreDeltas: [],
    }
  }

  // ── Capability checks ──

  canBuzz(state: GameState, _userCode: string): boolean {
    return state.currentPhase === 'bp' && state.currentQuestion !== null
  }

  canSubmit(state: GameState, _userCode: string): boolean {
    return state.currentQuestion !== null
  }

  canAdvance(state: GameState): boolean {
    return state.currentPhase !== null
  }

  // ── Scoring ──

  calculateScore(action: PlayerAction, state: GameState): ScoreDelta[] {
    const { userCode, type, payload } = action

    switch (type) {
      case 'buzz': {
        // Buzz itself doesn't score — scoring happens on resolve
        return []
      }

      case 'bp_resolve': {
        const buzzOrder = state.buzzOrder.map((code) => ({
          userCode: code,
          timestamp: state.buzzTimestamps[code] || 0,
        }))
        return bpResolve(buzzOrder).map((delta) => {
          const power = state.veDichPowers.find((p) => p.userCode === delta.userCode)?.power
          return {
            ...delta,
            points: applyVeDichPower(delta.points, power),
          }
        })
      }

      case 'kdc_correct':
        return [kdcCorrect(userCode)]

      case 'kdr_correct': {
        const key = `${state.currentQuestion?.questionCode}:${userCode}`
        const attempts = (state.kdrAttempts[key] || 0) + 1
        return [kdrCorrect(userCode, attempts)]
      }

      case 'kdr_wrong': {
        const key = `${state.currentQuestion?.questionCode}:${userCode}`
        const newState = {
          ...state,
          kdrAttempts: {
            ...state.kdrAttempts,
            [key]: (state.kdrAttempts[key] || 0) + 1,
          },
        }
        // Side effect: update attempts
        Object.assign(state, newState)
        return [kdrWrong(userCode)]
      }

      case 'gm_clue_correct':
        return [gmClueCorrect(userCode)]

      case 'gm_keyword_correct': {
        const playerState = state.gmPlayerStates[userCode]
        const cluesOpened = playerState?.cluesOpened || 0
        return [gmKeywordCorrect(userCode, cluesOpened)]
      }

      case 'vdr_correct':
      case 'vdr_wrong': {
        const questionCode = (payload.question_code as string) || state.currentQuestion?.questionCode || ''
        const correct = type === 'vdr_correct'
        const delta = vdrScore(userCode, questionCode, correct)
        const power = state.veDichPowers.find((p) => p.userCode === userCode)?.power
        return [{ ...delta, points: applyVeDichPower(delta.points, power) }]
      }

      case 'vdc_resolve': {
        const questionCode = (payload.question_code as string) || state.currentQuestion?.questionCode || ''
        const correctCodes = (payload.correct_codes as string[]) || []
        const allPlayers = Object.keys(state.answers)
        return vdcResolve(allPlayers, correctCodes, questionCode).map((delta) => {
          const power = state.veDichPowers.find((p) => p.userCode === delta.userCode)?.power
          return { ...delta, points: applyVeDichPower(delta.points, power) }
        })
      }

      default:
        return []
    }
  }

  // ── Reconnect snapshot ──

  getSnapshotForReconnect(state: GameState, _userCode: string): ReplayPayload[] {
    const messages: ReplayPayload[] = []

    if (state.currentQuestion) {
      messages.push({
        type: 'send_question',
        question_code: state.currentQuestion.questionCode,
        content: state.currentQuestion.content,
        media_source: state.currentQuestion.mediaUrl,
      })
    }

    if (state.timer) {
      messages.push({
        type: 'start_the_timer',
        time_limit: state.timer.timeLimit,
        started_at: state.timer.startedAt,
        phase: state.timer.phase,
      })
    }

    if (state.veDichPowers.length > 0) {
      messages.push({
        type: 'vd_powers_used',
        used_powers: Object.fromEntries(state.veDichPowers.map((p) => [p.userCode, p.power])),
      })
    }

    for (const winner of state.buzzerWinners) {
      messages.push({
        type: 'buzzer_winner',
        user_code: winner.userCode,
        question_code: winner.questionCode,
        match_code: state.matchCode,
      })
    }

    return messages
  }
}
