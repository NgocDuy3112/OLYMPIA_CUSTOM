import { useContext } from "react";
import { MCWebSocketContext } from "@/contexts/mcWsImpl";
import type { McWsContextValue } from "@/contexts/mcWsImpl";

export function useMcWebSocket(): McWsContextValue {
    const ctx = useContext(MCWebSocketContext);
    if (!ctx) {
        return {
            isConnected: false,
            lastMessage: null,
            sendMessage: async () => false,
        };
    }
    return ctx;
}
