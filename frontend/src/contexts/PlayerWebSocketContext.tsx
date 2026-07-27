import React, { useEffect } from "react";
import type { ReactNode } from "react";
import { useWebSocket } from "@/hooks/useWebSocket";
import { PlayerWebSocketContext } from "@/contexts/playerWsImpl";
import type { PlayerWsContextValue } from "@/contexts/playerWsImpl";
import { usePlayerSession } from "@/hooks/usePlayerSession";

export const PlayerWebSocketProvider: React.FC<{ matchCode: string; children: ReactNode }> = ({
  matchCode,
  children,
}) => {
  const token = sessionStorage.getItem("jwtToken_player") ?? undefined;
  const ws = useWebSocket(matchCode, token);

  const value: PlayerWsContextValue = {
    isConnected: ws.isConnected,
    lastMessage: ws.lastMessage,
    sendMessage: ws.sendMessage,
  };

  const { playerCode } = usePlayerSession();
  useEffect(() => {
    if (!ws.isConnected) return;
    if (!playerCode) return;

    void ws.sendMessage({ type: "player_online", user_code: playerCode });
  }, [ws.isConnected, playerCode, ws.sendMessage]);

  useEffect(() => {
    const raw = ws.lastMessage as { type?: string; message?: { type?: string } } | null;
    const last = raw?.message ?? raw;
    if (!last) return;
    if (last.type !== "request_presence") return;
    if (!ws.isConnected) return;
    if (!playerCode) return;
    void ws.sendMessage({ type: "player_heartbeat", user_code: playerCode });
  }, [ws.lastMessage, ws.isConnected, playerCode, ws.sendMessage]);

  useEffect(() => {
    const raw = ws.lastMessage as {
      type?: string;
      user_code?: string | number;
      targets?: Array<string | number>;
      client_ts?: number;
      message?: {
        type?: string;
        user_code?: string | number;
        targets?: Array<string | number>;
        client_ts?: number;
      };
    } | null;
    const last = raw?.message ?? raw;
    if (!last) return;
    if (last.type !== "ping_latency") return;
    if (!ws.isConnected) return;
    if (!playerCode) return;

    const targets = last.targets;
    if (Array.isArray(targets) && targets.length > 0) {
      const matches = targets.some((t) => String(t) === String(playerCode));
      if (!matches) return;
    }
    void ws.sendMessage({
      type: "pong_latency",
      user_code: playerCode,
      client_ts: typeof last.client_ts === "number" ? last.client_ts : Date.now(),
    });
  }, [ws.lastMessage, ws.isConnected, playerCode, ws.sendMessage]);

  useEffect(() => {
    if (!ws.isConnected || !playerCode) return;
    const intervalId = window.setInterval(() => {
      void ws.sendMessage({ type: "player_heartbeat", user_code: playerCode });
    }, 10_000);
    return () => window.clearInterval(intervalId);
  }, [ws.isConnected, playerCode, ws.sendMessage]);

  return <PlayerWebSocketContext.Provider value={value}>{children}</PlayerWebSocketContext.Provider>;
};
