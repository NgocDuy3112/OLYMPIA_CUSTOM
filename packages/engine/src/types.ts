/**
 * Core types for the game engine.
 *
 * This file contains ALL shared types — no runtime imports,
 * pure TypeScript definitions only.
 */

// ── Match status ──

export type MatchStatus = 'setup' | 'active' | 'in_progress' | 'paused' | 'completed' | 'finished'

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

// ── Reconnect snapshot ──

export interface ReplayPayload {
  type: string
  [key: string]: unknown
}

// TournamentEngine contract lives in core/engine.ts.
// These result types remain exported for OC3/OC4 compatibility during migration.
export type { TournamentEngine } from './core/engine.js'
export type { Result, DomainEvent, DomainError } from './core/result.js'
