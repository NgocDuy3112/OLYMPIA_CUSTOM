/**
 * Broadcast builder — converts engine BroadcastPayload to WS messages.
 */

import type { BroadcastPayload } from "../types.js";

export function buildBroadcastMessage(
  payload: BroadcastPayload,
): Record<string, unknown> {
  return { ...payload };
}
