/**
 * useWsMessage — Central WebSocket message selector.
 *
 * Unwraps the context `lastMessage` (handles nested `message` payloads) and
 * optionally filters by message type. Use this instead of ad-hoc
 * `JSON.parse` / `?? lastMessage` handling in components.
 */
import { useMemo } from "react";
import { useGameWebSocket } from "./useGameWebSocket";
import type { WebSocketMessage } from "@/types/websocket";
import { unwrapWebSocketMessage } from "@/types/websocket";

export function useWsMessage(...types: string[]): WebSocketMessage | null {
  const { lastMessage } = useGameWebSocket();
  const typesKey = types.length ? types.join(",") : "";

  return useMemo(() => {
    const message = unwrapWebSocketMessage(lastMessage);
    if (!message) return null;
    if (!typesKey) return message;
    return typesKey.split(",").includes(message.type) ? message : null;
  }, [lastMessage, typesKey]);
}

export default useWsMessage;
