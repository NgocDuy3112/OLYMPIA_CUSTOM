import { createContext } from "react";
import type { WebSocketContextValue } from "@/types/websocket";

export const WebSocketContext = createContext<WebSocketContextValue | null>(
  null,
);
