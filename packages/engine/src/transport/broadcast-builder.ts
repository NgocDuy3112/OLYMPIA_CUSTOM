
import type { BroadcastPayload } from "../types.js";

export function buildBroadcastMessage(
  payload: BroadcastPayload,
): Record<string, unknown> {
  return { ...payload };
}
