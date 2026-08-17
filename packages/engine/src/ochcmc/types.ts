export type OHCMCPhase = 'qualifier' | 'team_match' | 'final'

export interface OHCMCAction {
  type: string
  userCode: string
  matchCode: string
  phase: OHCMCPhase
  payload: Record<string, unknown>
}

export interface OHCMCState {
  matchCode: string
  currentPhase: OHCMCPhase | null
  scores: Record<string, number>
  teams: string[]
  completedPhases: OHCMCPhase[]
}
