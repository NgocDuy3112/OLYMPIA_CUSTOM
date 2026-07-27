import { useEffect, useRef } from "react";
import type { PlayerStatus } from "@/types/player";

interface UsePlayerPresenceOptions {

    lastMessage: unknown;
    setPlayers: React.Dispatch<React.SetStateAction<PlayerStatus[]>>;
}

const HEARTBEAT_TIMEOUT_MS = 25_000;
const OFFLINE_CHECK_INTERVAL_MS = 10_000;

export function usePlayerPresence({ lastMessage, setPlayers }: UsePlayerPresenceOptions): void {
    const lastSeenRef = useRef<Record<string, number>>({});

    useEffect(() => {
        if (!lastMessage) return;
        const msg = lastMessage as Record<string, unknown>;
        if (msg.type !== "player_heartbeat" || !msg.user_code) return;
        const code = String(msg.user_code);
        lastSeenRef.current[code] = Date.now();
        setPlayers((prev) => {
            if (prev.some((p) => p.playerCode === code)) {
                return prev.map((p) =>
                    p.playerCode === code ? { ...p, playerConnected: true } : p,
                );
            }

            return [...prev, { playerCode: code, playerName: "", playerScore: 0, playerConnected: true }];
        });
    }, [lastMessage, setPlayers]);

    useEffect(() => {
        if (!lastMessage) return;
        const msg = lastMessage as Record<string, unknown>;
        if (msg.type !== "player_online" || !msg.user_code) return;
        lastSeenRef.current[String(msg.user_code)] = Date.now();
    }, [lastMessage]);

    useEffect(() => {
        const intervalId = window.setInterval(() => {
            const now = Date.now();
            setPlayers((prev) =>
                prev.map((p) => {
                    const lastSeen = lastSeenRef.current[p.playerCode];
                    if (lastSeen === undefined) return p;
                    const isOnline = now - lastSeen < HEARTBEAT_TIMEOUT_MS;
                    return p.playerConnected !== isOnline ? { ...p, playerConnected: isOnline } : p;
                }),
            );
        }, OFFLINE_CHECK_INTERVAL_MS);
        return () => window.clearInterval(intervalId);
    }, [setPlayers]);
}
