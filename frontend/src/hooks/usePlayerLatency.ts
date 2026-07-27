import { useEffect, useRef } from "react";
import type { PlayerStatus } from "@/types/player";

interface UsePlayerLatencyOptions {

    lastMessage: unknown;

    sendMessage: (payload: Record<string, unknown>) => Promise<boolean>;

    players: PlayerStatus[];

    setPlayers: React.Dispatch<React.SetStateAction<PlayerStatus[]>>;

    intervalMs?: number;

    enabled?: boolean;
}

const DEFAULT_INTERVAL_MS = 10_000;
const PONG_TIMEOUT_MS = 5_000;

const PLAYER_CHANGE_DEBOUNCE_MS = 500;

interface PendingPing {
    sentAt: number;
    timeoutId: number;
}

interface RawMessage {
    type?: string;
    user_code?: string | number;
    client_ts?: number;
    server_ts?: number;
    message?: RawMessage;
}

export function usePlayerLatency({
    lastMessage,
    sendMessage,
    players,
    setPlayers,
    intervalMs = DEFAULT_INTERVAL_MS,
    enabled = true,
}: UsePlayerLatencyOptions): void {

    const pendingRef = useRef<Map<string, PendingPing>>(new Map());

    const playersRef = useRef<PlayerStatus[]>(players);
    useEffect(() => {
        playersRef.current = players;
    }, [players]);

    const sendMessageRef = useRef(sendMessage);
    useEffect(() => {
        sendMessageRef.current = sendMessage;
    }, [sendMessage]);

    useEffect(() => {
        if (!lastMessage) return;
        const raw = lastMessage as RawMessage;
        const msg = raw.message ?? raw;
        if (!msg || msg.type !== "pong_latency") return;
        const code = String(msg.user_code ?? "");
        if (!code) return;
        const sentAt = msg.client_ts;
        if (typeof sentAt !== "number") return;

        const pending = pendingRef.current.get(code);
        if (!pending) return;
        window.clearTimeout(pending.timeoutId);
        pendingRef.current.delete(code);

        const rtt = Date.now() - pending.sentAt;
        setPlayers((prev) =>
            prev.map((p) => (p.playerCode === code ? { ...p, playerLatencyMs: rtt } : p)),
        );
    }, [lastMessage, setPlayers]);

    const tickRef = useRef<() => void>(() => {});
    useEffect(() => {
        if (!enabled) return;

        const tick = () => {

            const targets = playersRef.current
                .filter((p) => p.playerConnected && p.playerCode)
                .map((p) => p.playerCode);
            if (targets.length === 0) return;

            const now = Date.now();
            void sendMessageRef.current({
                type: "ping_latency",
                targets,
                client_ts: now,
            });

            for (const code of targets) {

                const previous = pendingRef.current.get(code);
                if (previous) {
                    window.clearTimeout(previous.timeoutId);
                }
                const timeoutId = window.setTimeout(() => {
                    pendingRef.current.delete(code);
                    setPlayers((prev) =>
                        prev.map((p) =>
                            p.playerCode === code && p.playerLatencyMs != null
                                ? { ...p, playerLatencyMs: null }
                                : p,
                        ),
                    );
                }, PONG_TIMEOUT_MS);
                pendingRef.current.set(code, { sentAt: now, timeoutId });
            }
        };
        tickRef.current = tick;

        tick();

        const intervalId = window.setInterval(tick, intervalMs);

        const pendingAtTeardown = pendingRef.current;
        return () => {
            window.clearInterval(intervalId);

            for (const pending of pendingAtTeardown.values()) {
                window.clearTimeout(pending.timeoutId);
            }
            pendingAtTeardown.clear();
        };
    }, [enabled, intervalMs, setPlayers]);

    useEffect(() => {
        if (!enabled) return;

        const debounceId = window.setTimeout(() => {
            tickRef.current();
        }, PLAYER_CHANGE_DEBOUNCE_MS);
        return () => window.clearTimeout(debounceId);
    }, [players, enabled]);
}

export default usePlayerLatency;
