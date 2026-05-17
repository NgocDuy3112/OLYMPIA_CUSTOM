import { useEffect, useRef } from "react";
import type { PlayerStatus } from "@/types/player";

interface UsePlayerPresenceOptions {
    /** The latest WebSocket message from the room — same value passed to the page's WS effect. */
    lastMessage: unknown;
    setPlayers: React.Dispatch<React.SetStateAction<PlayerStatus[]>>;
}

/**
 * Tracks real-time connection status for players.
 *
 * - Listens for `player_heartbeat` messages (sent by PlayerWebSocketContext every 15 s and in
 *   response to `request_presence`) to mark players as connected and record their last-seen time.
 * - Also records last-seen when `player_online` fires to avoid a false-offline race during init.
 * - Runs an offline-detection interval every 10 s: any player whose last heartbeat was >25 s ago
 *   is marked disconnected.
 */
const HEARTBEAT_TIMEOUT_MS = 25_000;
const OFFLINE_CHECK_INTERVAL_MS = 10_000;

export function usePlayerPresence({ lastMessage, setPlayers }: UsePlayerPresenceOptions): void {
    const lastSeenRef = useRef<Record<string, number>>({});

    // Mark player as connected when their heartbeat arrives.
    // Also add unknown players as placeholders so they appear in the list
    // even if loadPlayersState hasn't run yet or missed them.
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
            // Unknown player — add placeholder; name will be filled by player_online or API fetch
            return [...prev, { playerCode: code, playerName: "", playerScore: 0, playerConnected: true }];
        });
    }, [lastMessage, setPlayers]);

    // Update last-seen when player_online fires so we don't immediately flip them offline
    // after the initial presence exchange.
    useEffect(() => {
        if (!lastMessage) return;
        const msg = lastMessage as Record<string, unknown>;
        if (msg.type !== "player_online" || !msg.user_code) return;
        lastSeenRef.current[String(msg.user_code)] = Date.now();
    }, [lastMessage]);

    // Periodically flip players offline when their heartbeat goes stale.
    useEffect(() => {
        const intervalId = window.setInterval(() => {
            const now = Date.now();
            setPlayers((prev) =>
                prev.map((p) => {
                    const lastSeen = lastSeenRef.current[p.playerCode];
                    if (lastSeen === undefined) return p; // never seen — leave as-is
                    const isOnline = now - lastSeen < HEARTBEAT_TIMEOUT_MS;
                    return p.playerConnected !== isOnline ? { ...p, playerConnected: isOnline } : p;
                }),
            );
        }, OFFLINE_CHECK_INTERVAL_MS);
        return () => window.clearInterval(intervalId);
    }, [setPlayers]);
}
