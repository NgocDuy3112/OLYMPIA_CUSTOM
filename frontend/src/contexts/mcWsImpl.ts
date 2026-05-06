import { createContext } from "react";

export interface McWsContextValue {
  isConnected: boolean;
  lastMessage: unknown;
  sendMessage: (payload: Record<string, unknown>) => Promise<boolean>;
}

export const MCWebSocketContext = createContext<McWsContextValue | null>(null);
