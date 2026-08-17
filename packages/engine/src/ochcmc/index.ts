import type { TournamentEngine } from '../core/engine.js'
import { success, failure } from '../core/result.js'
import type { Result } from '../core/result.js'
import type { OHCMCAction, OHCMCPhase, OHCMCState } from './types.js'

/** Independent OHCMC engine. No OC3/OC4 phases, state, or scoring. */
export class OHCMCEngine implements TournamentEngine<OHCMCState, OHCMCAction, OHCMCPhase> {
  readonly id = 'ochcmc'
  readonly name = 'OHCMC'
  readonly phases: readonly OHCMCPhase[] = ['qualifier', 'team_match', 'final']

  initMatch(matchCode: string): OHCMCState {
    return { matchCode, currentPhase: null, scores: {}, teams: [], completedPhases: [] }
  }

  startMatch(state: OHCMCState): Result<OHCMCState> {
    return success({ ...state, currentPhase: null }, [{ type: 'match_started', match_code: state.matchCode }])
  }

  canStartPhase(state: OHCMCState, phase: OHCMCPhase): boolean {
    return this.phases.includes(phase) && !state.completedPhases.includes(phase)
  }

  startPhase(state: OHCMCState, phase: OHCMCPhase): Result<OHCMCState> {
    if (!this.canStartPhase(state, phase)) return failure('INVALID_PHASE', `Cannot start OHCMC phase: ${phase}`)
    return success(
      { ...state, currentPhase: phase },
      [{ type: 'phase_started', phase, match_code: state.matchCode }],
    )
  }

  endPhase(state: OHCMCState, phase: OHCMCPhase): Result<OHCMCState> {
    if (state.currentPhase !== phase) return failure('PHASE_NOT_ACTIVE', `OHCMC phase is not active: ${phase}`)
    return success(
      { ...state, currentPhase: null, completedPhases: [...state.completedPhases, phase] },
      [{ type: 'phase_ended', phase, match_code: state.matchCode }],
    )
  }

  handleAction(state: OHCMCState, action: OHCMCAction): Result<OHCMCState> {
    if (state.currentPhase !== action.phase) return failure('PHASE_NOT_ACTIVE', 'Action phase is not active')
    return success(state, [{ type: 'action_received', action_type: action.type, user_code: action.userCode }])
  }
}
