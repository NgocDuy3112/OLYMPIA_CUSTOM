/**
 * OC4 Engine — Olympia Custom 4.
 *
 * Currently identical to OC3. Override methods here as OC4 diverges.
 */

import { OC3Engine } from '../oc3/index.js'
import { OC4_CONFIG } from './config.js'

export class OC4Engine extends OC3Engine {
  override readonly id: string = OC4_CONFIG.id
  override readonly name: string = OC4_CONFIG.name
}
