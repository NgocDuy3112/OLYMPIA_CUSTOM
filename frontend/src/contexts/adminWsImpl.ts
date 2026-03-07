import { createContext } from "react";

export interface AdminWsContextValue {
  isConnected: boolean;
  lastMessage: unknown;
  sendMessage: (payload: Record<string, unknown>) => Promise<boolean>;
}

export const AdminWebSocketContext = createContext<AdminWsContextValue | null>(null);
