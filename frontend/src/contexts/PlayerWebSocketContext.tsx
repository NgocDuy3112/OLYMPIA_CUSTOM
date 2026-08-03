import React, { useEffect, useMemo } from "react";
import type { ReactNode } from "react";
import { useWebSocket } from "@/hooks/useWebSocket";
import { WebSocketContext } from "@/contexts/WebSocketContext";
import type { WebSocketContextValue } from "@/types/websocket";
import { useRoleSession } from "@/hooks/useRoleSession";
import { unwrapWebSocketMessage } from "@/types/websocket";

export const PlayerWebSocketProvider: React.FC<{ matchCode: string; children: ReactNode }> = ({
  matchCode,
  children,
}) => {
  const token = sessionStorage.getItem("jwtToken_player") ?? undefined;
  const ws = useWebSocket(matchCode, token);
  const { isConnected, lastMessage, sendMessage } = ws;

  const value = useMemo<WebSocketContextValue>(
    () => ({ isConnected, lastMessage, sendMessage }),
    [isConnected, lastMessage, sendMessage],
  );

  const { playerCode } = useRoleSession("player");
  useEffect(() => {
    if (!isConnected) return;
    if (!playerCode) return;

    void sendMessage({ type: "user_online", user_code: playerCode, status: "online" });
  }, [isConnected, playerCode, sendMessage]);

  useEffect(() => {
    const last = unwrapWebSocketMessage(lastMessage);
    if (!last) return;
    if (last.type !== "request_presence") return;
    if (!isConnected) return;
    if (!playerCode) return;
    void sendMessage({ type: "user_online", user_code: playerCode, status: "heartbeat" });
  }, [lastMessage, isConnected, playerCode, sendMessage]);

  useEffect(() => {
    const last = unwrapWebSocketMessage(lastMessage);
    if (!last) return;
    if (last.type !== "ping_latency") return;
    if (!isConnected) return;
    if (!playerCode) return;

    const targets = last.targets;
    if (Array.isArray(targets) && targets.length > 0) {
      const matches = targets.some((t) => String(t) === String(playerCode));
      if (!matches) return;
    }
    void sendMessage({
      type: "pong_latency",
      user_code: playerCode,
      client_ts: typeof last.client_ts === "number" ? last.client_ts : Date.now(),
    });
  }, [lastMessage, isConnected, playerCode, sendMessage]);

  useEffect(() => {
    if (!isConnected || !playerCode) return;
    const intervalId = window.setInterval(() => {
      void sendMessage({ type: "user_online", user_code: playerCode, status: "heartbeat" });
    }, 10_000);
    return () => window.clearInterval(intervalId);
  }, [isConnected, playerCode, sendMessage]);

  return <WebSocketContext.Provider value={value}>{children}</WebSocketContext.Provider>;
};
