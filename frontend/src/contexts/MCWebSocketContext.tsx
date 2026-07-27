import React, { useEffect } from "react";
import type { ReactNode } from "react";
import { useWebSocket } from "@/hooks/useWebSocket";
import { MCWebSocketContext } from "@/contexts/mcWsImpl";
import type { McWsContextValue } from "@/contexts/mcWsImpl";
import { useMcSession } from "@/hooks/useMcSession";

export const MCWebSocketProvider: React.FC<{ matchCode: string; children: ReactNode }> = ({
  matchCode,
  children,
}) => {
  const token = sessionStorage.getItem("jwtToken_mc") ?? undefined;
  const ws = useWebSocket(matchCode, token);
  const { mcCode } = useMcSession();

  const value: McWsContextValue = {
    isConnected: ws.isConnected,
    lastMessage: ws.lastMessage,
    sendMessage: ws.sendMessage,
  };

  useEffect(() => {
    if (!ws.isConnected) return;
    if (!mcCode) return;
    void ws.sendMessage({ type: "mc_online", user_code: mcCode });
  }, [ws.isConnected, mcCode, ws.sendMessage]);

  return <MCWebSocketContext.Provider value={value}>{children}</MCWebSocketContext.Provider>;
};
