import { createContext } from "react";

export interface GuestWsContextValue {
  isConnected: boolean;
  lastMessage: unknown;
  sendMessage: (payload: Record<string, unknown>) => Promise<boolean>;
}

export const GuestWebSocketContext = createContext<GuestWsContextValue | null>(null);