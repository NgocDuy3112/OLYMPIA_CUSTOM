import { useContext } from "react";
import { WebSocketContext } from "@/contexts/WebSocketContext";

export function useGameWebSocket() {
  const context = useContext(WebSocketContext);
  if (!context) throw new Error("useGameWebSocket must be used within a WebSocket provider");
  return context;
}
