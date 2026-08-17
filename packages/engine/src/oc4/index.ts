/**
 * OC4 Engine — OC 4.
 *
 * Currently identical to OC3. Override methods here as OC4 diverges.
 */

import { OC3Engine } from '../oc3/index.js'
import type { ScoreDelta } from '../types.js'
import type { OC3State, OC3Action } from '../oc3/types.js'
import { OC4_CONFIG } from './config.js'
import { gmKeywordCorrectOc4, kdrCorrectOnce } from './scoring.js'

export class OC4Engine extends OC3Engine {
  override readonly id: string = OC4_CONFIG.id
  override readonly name: string = OC4_CONFIG.name

  override calculateScore(action: OC3Action, state: OC3State): ScoreDelta[] {
    if (action.type === 'kdr_correct') {
      return [kdrCorrectOnce(action.userCode)]
    }

    if (action.type === 'kdr_wrong') {
      return [{ userCode: action.userCode, points: 0, reason: 'kdr_wrong' }]
    }

    if (action.type === 'gm_keyword_correct') {
      const cluesOpened = state.gmPlayerStates[action.userCode]?.cluesOpened ?? 0
      return [gmKeywordCorrectOc4(action.userCode, cluesOpened)]
    }

    // Clue opening itself has no score delta in OC4.
    if (action.type === 'gm_clue_correct') {
      return []
    }

    return super.calculateScore(action, state)
  }
}
