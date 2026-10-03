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
