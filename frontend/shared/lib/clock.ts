import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export const URGENT_BELOW_MS = 5_000;

export function skewOf(at: string, receivedAtMs: number): number {
    const server = Date.parse(at);
    if (Number.isNaN(server)) return 0;
    return server - receivedAtMs;
}

export function remainingOf(deadlineAt: string | null, skew: number, nowMs: number): number {
    if (!deadlineAt) return 0;
    const deadline = Date.parse(deadlineAt);
    if (Number.isNaN(deadline)) return 0;
    return Math.max(0, deadline - (nowMs + skew));
}

export function formatRemaining(ms: number): string {
    const totalSeconds = Math.ceil(Math.max(0, ms) / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function formatDurationMs(ms: number): string {
    const clamped = Math.max(0, Math.round(ms))
    const seconds = Math.floor(clamped / 1000)
    return `${String(seconds).padStart(2, "0")}.${String(clamped % 1000).padStart(3, "0")}`
}

export function isUrgent(ms: number): boolean {
    return ms > 0 && ms <= URGENT_BELOW_MS;
}


export interface ServerClock {
    sync: (at: string) => void;
    skew: () => number;
}

export function useServerClock(): ServerClock {
    const skewRef = useRef(0);

    const sync = useCallback((at: string) => {
        skewRef.current = skewOf(at, Date.now());
    }, []);

    const skew = useCallback(() => skewRef.current, []);

    return useMemo(() => ({ sync, skew }), [sync, skew]);
}

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

/**
 * Counts down a duration (ms) that has no wall-clock deadline — e.g. the
 * oral run's remaining budget. Pass a resetKey (the question id) so a new
 * question restarts from the fresh duration even when the value repeats.
 */
export function useCountdownMs(durationMs: number | null, resetKey?: unknown): number | null {
    const [left, setLeft] = useState<number | null>(durationMs);
    const [prev, setPrev] = useState<{ durationMs: number | null; resetKey: unknown }>({
        durationMs,
        resetKey,
    });

    if (prev.durationMs !== durationMs || prev.resetKey !== resetKey) {
        setPrev({ durationMs, resetKey });
        setLeft(durationMs);
    }

    useEffect(() => {
        if (durationMs === null) return;
        const interval = setInterval(() => {
            setLeft((value) => {
                if (value === null) return value;
                return Math.max(0, value - 1000);
            });
        }, 1000);
        return () => clearInterval(interval);
    }, [durationMs, resetKey]);

    return left;
}
