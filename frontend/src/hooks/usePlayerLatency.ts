import { useEffect, useRef } from "react";
import type { PlayerStatus } from "@/types/player";

interface UsePlayerLatencyOptions {
    /** The latest WebSocket message from the room — same value passed to the page's WS effect. */
    lastMessage: unknown;
    /** Send a payload through the room's WebSocket. */
    sendMessage: (payload: Record<string, unknown>) => Promise<boolean>;
    /** All players currently tracked. Latency samples are only requested for connected ones. */
    players: PlayerStatus[];
    /** Setter used to write measured latencies back into PlayerStatus. */
    setPlayers: React.Dispatch<React.SetStateAction<PlayerStatus[]>>;
    /** Interval (ms) between ping rounds. Defaults to 10 000 (10 s). */
    intervalMs?: number;
    /**
     * Skip latency sampling (e.g. when admin is not connected to the room).
     * The hook will still react to inbound `pong_latency` messages even when
     * sampling is paused, so a late pong after a pause still updates state.
     */
    enabled?: boolean;
}

const DEFAULT_INTERVAL_MS = 10_000;
const PONG_TIMEOUT_MS = 5_000;
// How long to wait after `players` mutates before re-issuing a ping. Debounces
// the rapid setPlayers() calls that happen when a page first loads (snapshot,
// presence heartbeats, score updates) so we don't spam the room with pings.
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

/**
 * Periodically measures per-player RTT over the existing WebSocket by sending
 * a `ping_latency` message and waiting for the player's `pong_latency` reply.
 *
 * Runs on the admin side. Each ping is broadcast to the room and only the
 * targeted player responds. We record RTT per `user_code` as `pong_latency`
 * messages come back.
 *
 * Players that fail to reply within `PONG_TIMEOUT_MS` are marked with `null`
 * (displayed as a greyed-out 0-bar icon) until a later sample succeeds.
 *
 * The interval is set up exactly once and ticks at a steady cadence
 * regardless of how often the player list mutates. A separate effect
 * triggers an extra tick (debounced) whenever the player list changes
 * significantly, so navigating between admin pages — which resets the
 * page-local `players` state to `[]` on mount — gets a fresh sample
 * within ~1 s of the new page's `loadPlayersState` finishing.
 */
export function usePlayerLatency({
    lastMessage,
    sendMessage,
    players,
    setPlayers,
    intervalMs = DEFAULT_INTERVAL_MS,
    enabled = true,
}: UsePlayerLatencyOptions): void {
    // Map of user_code -> pending ping info. Lives in a ref so the periodic
    // pinger effect and the inbound-pong effect can both read/write it
    // without re-creating the interval.
    const pendingRef = useRef<Map<string, PendingPing>>(new Map());

    // Keep the latest `players` array in a ref so the ping effect can read
    // it inside the interval callback WITHOUT having to re-create the
    // interval every time `players` changes. Without this, any heartbeat
    // (or any other setPlayers call) would clear the interval and arm a
    // new one — the interval would never get a chance to fire because
    // player state mutates faster than the 10s cadence.
    const playersRef = useRef<PlayerStatus[]>(players);
    useEffect(() => {
        playersRef.current = players;
    }, [players]);

    // Latest `sendMessage` in a ref so the tick function stored in tickRef
    // can call the current one.
    const sendMessageRef = useRef(sendMessage);
    useEffect(() => {
        sendMessageRef.current = sendMessage;
    }, [sendMessage]);

    // React to inbound `pong_latency` messages. Calculate RTT = now - sentAt.
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

    // Hold the latest `tick` in a ref so other effects (the player-change
    // debouncer below) can call it without rebuilding the interval.
    const tickRef = useRef<() => void>(() => {});
    useEffect(() => {
        if (!enabled) return;

        const tick = () => {
            // Read the latest players snapshot at tick time so we don't
            // capture a stale closure of `players`.
            const targets = playersRef.current
                .filter((p) => p.playerConnected && p.playerCode)
                .map((p) => p.playerCode);
            if (targets.length === 0) return;

            // Send a single broadcast ping that carries a per-target list.
            // The backend forwards it to the room; each player's client
            // responds with their own `pong_latency` (we keep the same
            // client_ts in the broadcast for traceability, then derive RTT
            // from when we sent it locally).
            const now = Date.now();
            void sendMessageRef.current({
                type: "ping_latency",
                targets,
                client_ts: now,
            });

            // Arm a timeout per target so a dropped pong flips the icon
            // back to the "no data" state instead of leaving stale bars.
            for (const code of targets) {
                // If there was a previous pending ping for this player that
                // never came back, clear it before arming a new one.
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

        // Fire one ping immediately on mount/connect so admin doesn't have
        // to wait a full interval for the first sample to appear. Without
        // this, the user sees a grey 0-bar icon for up to 10s after the
        // page loads even though ping/pong would otherwise complete in
        // a few hundred ms.
        tick();

        const intervalId = window.setInterval(tick, intervalMs);
        // Snapshot the current pending map at effect-teardown time. The ref
        // may have been reassigned by the time the cleanup runs, so we
        // can't rely on `pendingRef.current` still pointing at this map.
        const pendingAtTeardown = pendingRef.current;
        return () => {
            window.clearInterval(intervalId);
            // Clear any pending pings on unmount so the timeout callbacks
            // don't fire after the consumer unmounts.
            for (const pending of pendingAtTeardown.values()) {
                window.clearTimeout(pending.timeoutId);
            }
            pendingAtTeardown.clear();
        };
    }, [enabled, intervalMs, setPlayers]);

    // Whenever `players` changes, debounce a fresh ping so the user sees a
    // new sample as soon as the new page's player list has loaded — without
    // waiting up to `intervalMs` for the periodic tick. This fixes the
    // "all icons grey for 10s after navigating to a new round" case.
    useEffect(() => {
        if (!enabled) return;
        // Skip the very first effect run: the ping effect above already
        // fired an initial tick on mount. We approximate "first run" by
        // checking whether `playersRef.current` has been updated since the
        // last players-change effect run — if it's still the initial array
        // we were constructed with, there's nothing new to sample.
        const debounceId = window.setTimeout(() => {
            tickRef.current();
        }, PLAYER_CHANGE_DEBOUNCE_MS);
        return () => window.clearTimeout(debounceId);
    }, [players, enabled]);
}

export default usePlayerLatency;
