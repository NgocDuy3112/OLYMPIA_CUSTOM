import { createContext } from "react";

export interface PlayerWsContextValue {
  isConnected: boolean;
  lastMessage: unknown;
  sendMessage: (payload: Record<string, unknown>) => Promise<boolean>;
  sendAnswer: (
    playerCode: string,
    questionCode: string,
    answer: string,
    timestamp: number,
    token: string,
  ) => Promise<boolean>;
  sendBuzz: (playerCode: string, questionCode: string, token: string) => Promise<boolean>;
}

export const PlayerWebSocketContext = createContext<PlayerWsContextValue | null>(null);
