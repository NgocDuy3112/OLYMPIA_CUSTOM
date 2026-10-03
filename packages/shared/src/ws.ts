
export type UserRole =
  | "admin"
  | "controller"
  | "mc"
  | "player"
  | "spectator"
  | "operator";

export interface WebSocketMessage {
  type: string;
  message?: WebSocketMessage;
  [key: string]: any;
}

export type WebSocketPayload = { type: string } & Record<string, unknown>;

export interface WebSocketContextValue {
  isConnected: boolean;
  lastMessage: WebSocketMessage | null;
  sendMessage: (payload: WebSocketPayload) => Promise<boolean>;
  role: UserRole;
}

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
