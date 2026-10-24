// Server time on a client screen.
//
// Every live message carries `at` (the server's clock at send) and every deadline
// in a view is an ABSOLUTE server instant. A countdown therefore has two halves:
// a skew captured from `at`, and a local tick that never trusts the local clock
// alone. The server enforces every deadline regardless — this only shows the truth
// about what the server will accept.
//
//   skew      = server(at) − client(receive)      // captured per message
//   remaining = deadline − (clientNow + skew)     // clamped ≥ 0
//
// The pure functions take `now` as an argument — never Date.now() inside — so a
// test pins time exactly (pure first).

import { useCallback, useEffect, useRef, useState } from "react";

// Display turns urgent at this remaining threshold (the 5 s buzz window's scale).
export const URGENT_BELOW_MS = 5_000;

// Server minus client, in ms, from one envelope.
export function skewOf(at: string, receivedAtMs: number): number {
    const server = Date.parse(at);
    if (Number.isNaN(server)) return 0;
    return server - receivedAtMs;
}

// Milliseconds left on a deadline under the given skew. null/invalid deadline and
// expired time all read 0 — a countdown pins at zero, never negative.
export function remainingOf(deadlineAt: string | null, skew: number, nowMs: number): number {
    if (!deadlineAt) return 0;
    const deadline = Date.parse(deadlineAt);
    if (Number.isNaN(deadline)) return 0;
    return Math.max(0, deadline - (nowMs + skew));
}

// "m:ss" — ceil, so a live second always shows itself (1 ms → "0:01"); only a
// truly expired deadline shows "0:00".
export function formatRemaining(ms: number): string {
    const totalSeconds = Math.ceil(Math.max(0, ms) / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function isUrgent(ms: number): boolean {
    return ms > 0 && ms <= URGENT_BELOW_MS;
}

// ── hooks ────────────────────────────────────────────────────────────────────
// Kept here (shared) so the MC's console and the players' screens tick against
// the SAME skew rules — the two sides must never disagree about the time.

export interface ServerClock {
    /** Feed every envelope's `at` here, as it arrives. Stable identity. */
    sync: (at: string) => void;
    /** The current skew (ms). Stable identity — safe in effect deps. */
    skew: () => number;
}

export function useServerClock(): ServerClock {
    const skewRef = useRef(0);

    const sync = useCallback((at: string) => {
        skewRef.current = skewOf(at, Date.now());
    }, []);

    const skew = useCallback(() => skewRef.current, []);

    return { sync, skew };
}

/**
 * Milliseconds remaining on a deadline, ticking while the tab is visible.
 *
 * - Recomputes immediately when the deadline (or skew) changes — every pushed
 *   view arrives with a fresh `at`, so the clock re-anchors itself.
 * - Recomputes on visibility return: a throttled background interval can never
 *   show a stale value to someone who just looked.
 * - null deadline → 0, no ticking.
 */
export function useCountdown(deadlineAt: string | null, clock: ServerClock): number {
    const [remaining, setRemaining] = useState(() =>
        remainingOf(deadlineAt, clock.skew(), Date.now())
    );

    useEffect(() => {
        const compute = () => setRemaining(remainingOf(deadlineAt, clock.skew(), Date.now()));

        compute();
        if (!deadlineAt) return;

        const interval = setInterval(compute, 250);
        const onVisibility = () => {
            if (!document.hidden) compute();
        };
        document.addEventListener("visibilitychange", onVisibility);

        return () => {
            clearInterval(interval);
            document.removeEventListener("visibilitychange", onVisibility);
        };
    }, [deadlineAt, clock]);

    return remaining;
}
