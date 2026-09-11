/**
 * WebSocket message contracts shared between apps/web and apps/api.
 */

export type UserRole =
  | "admin"
  | "controller"
  | "mc"
  | "player"
  | "spectator";

/** Parsed inbound WebSocket message. Payload fields stay loose but typed-safe. */
export interface WebSocketMessage {
  type: string;
  /** Some server messages wrap the payload inside `message`. */
  message?: WebSocketMessage;
  // Payload fields vary per message type (answers, scores, timers...) — keep
  // them loose at the boundary; consumers narrow with typeof/Array.isArray.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

/** Outbound WebSocket payload (client → server). */
export type WebSocketPayload = { type: string } & Record<string, unknown>;

export interface WebSocketContextValue {
  isConnected: boolean;
  lastMessage: WebSocketMessage | null;
  sendMessage: (payload: WebSocketPayload) => Promise<boolean>;
  role: UserRole;
}

/** Parse a raw WebSocket text frame. Returns null for invalid frames. */
export function parseWebSocketMessage(raw: string): WebSocketMessage | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as { type?: unknown }).type === "string"
    ) {
      return parsed as WebSocketMessage;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Unwrap a context `lastMessage`: server payloads sometimes nest the real
 * message inside `message`. Returns the inner object when it looks like a
 * message, otherwise the message itself. Null-safe.
 */
export function unwrapWebSocketMessage(
  lastMessage: WebSocketMessage | null | undefined,
): WebSocketMessage | null {
  if (!lastMessage) return null;
  const inner = lastMessage.message;
  if (inner && typeof inner.type === "string") {
    return inner;
  }
  return lastMessage;
}
