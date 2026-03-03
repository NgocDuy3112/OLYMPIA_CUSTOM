import { useContext } from "react";
import { AdminWebSocketContext } from "@/contexts/adminWsImpl";

export const useAdminWebSocket = () => {
  const ctx = useContext(AdminWebSocketContext);
  if (!ctx) throw new Error("useAdminWebSocket must be used within AdminWebSocketProvider");
  return ctx;
};

export default useAdminWebSocket;
