import { useContext } from "react";
import { PlayerWebSocketContext } from "@/contexts/playerWsImpl";

export const usePlayerWebSocket = () => {
  const ctx = useContext(PlayerWebSocketContext);
  if (!ctx) throw new Error("usePlayerWebSocket must be used within PlayerWebSocketProvider");
  return ctx;
};

export default usePlayerWebSocket;
