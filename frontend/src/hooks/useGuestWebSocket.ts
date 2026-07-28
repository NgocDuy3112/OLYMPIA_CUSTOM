import { useContext } from "react";
import { GuestWebSocketContext } from "@/contexts/guestWsImpl";
import type { GuestWsContextValue } from "@/contexts/guestWsImpl";

export function useGuestWebSocket(): GuestWsContextValue {
    const ctx = useContext(GuestWebSocketContext);
    if (!ctx) {
        return {
            isConnected: false,
            lastMessage: null,
            sendMessage: async () => false,
        };
    }
    return ctx;
}