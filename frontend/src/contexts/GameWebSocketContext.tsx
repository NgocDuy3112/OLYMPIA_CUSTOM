import React, { useEffect, useMemo } from "react";
import type { ReactNode } from "react";
import { useWebSocket } from "@/hooks/useWebSocket";
import { WebSocketContext } from "@/contexts/WebSocketContext";
import type { WebSocketContextValue, UserRole } from "@/types/websocket";

export type { UserRole };

interface GameWebSocketConfig {
  role: UserRole;
  matchCode: string;
  token?: string;
  userCode?: string;
  heartbeatInterval?: number; // ms, default 15000
  enablePresence?: boolean; // default true for player
  enableHeartbeat?: boolean; // default true for player
}

interface GameWebSocketProviderProps {
  config: GameWebSocketConfig;
  children: ReactNode;
}

export const GameWebSocketProvider: React.FC<GameWebSocketProviderProps> = ({
  config,
  children,
}) => {
  const {
    role,
    matchCode,
    token,
    userCode,
    heartbeatInterval = 15000,
    enablePresence = role === "player",
    enableHeartbeat = role === "player",
  } = config;

  const ws = useWebSocket(matchCode, token);
  const { isConnected, lastMessage, sendMessage } = ws;

  const value = useMemo<WebSocketContextValue>(
    () => ({ isConnected, lastMessage, sendMessage, role }),
    [isConnected, lastMessage, sendMessage, role],
  );

  // Player presence: send user_online on connect
  useEffect(() => {
    if (!enablePresence || !isConnected || !userCode) return;

    void sendMessage({
      type: "user_online",
      user_code: userCode,
      status: "online",
    });
  }, [enablePresence, isConnected, userCode, sendMessage]);

  // Response to request_presence
  useEffect(() => {
    if (!enablePresence || !isConnected || !userCode) return;

    const msg = lastMessage?.message ?? lastMessage;
    if (msg?.type !== "request_presence") return;

    void sendMessage({
      type: "user_online",
      user_code: userCode,
      status: "heartbeat",
    });
  }, [lastMessage, enablePresence, isConnected, userCode, sendMessage]);

  // Response to ping_latency
  useEffect(() => {
    if (!enablePresence || !isConnected || !userCode) return;

    const msg = lastMessage?.message ?? lastMessage;
    if (msg?.type !== "ping_latency") return;

    const targets = msg.targets;
    if (Array.isArray(targets) && targets.length > 0) {
      const matches = targets.some((t) => String(t) === String(userCode));
      if (!matches) return;
    }

    void sendMessage({
      type: "pong_latency",
      user_code: userCode,
      client_ts: typeof msg.client_ts === "number" ? msg.client_ts : Date.now(),
    });
  }, [lastMessage, enablePresence, isConnected, userCode, sendMessage]);

  // Periodic heartbeat
  useEffect(() => {
    if (!enableHeartbeat || !isConnected || !userCode) return;

    const intervalId = window.setInterval(() => {
      void sendMessage({
        type: "user_online",
        user_code: userCode,
        status: "heartbeat",
      });
    }, heartbeatInterval);

    return () => window.clearInterval(intervalId);
  }, [enableHeartbeat, isConnected, userCode, sendMessage, heartbeatInterval]);

  // Admin: periodic request_presence
  useEffect(() => {
    if (role !== "admin" || !isConnected) return;

    const initialTimer = window.setTimeout(() => {
      void sendMessage({ type: "request_presence" });
    }, 1500);

    const periodicTimer = window.setInterval(() => {
      void sendMessage({ type: "request_presence" });
    }, 30_000);

    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(periodicTimer);
    };
  }, [role, isConnected, sendMessage]);

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  );
};

export default GameWebSocketProvider;
