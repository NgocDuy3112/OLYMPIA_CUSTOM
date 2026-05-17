import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export interface CountdownTimerState {
    timeLimit: number;
    timer: number;
    timerDisplay: string;
    start: (timeLimitSeconds: number) => void;
    /** Start the timer synced to when admin fired the signal.
     *  Automatically subtracts elapsed time since `startedAt` (ms epoch).
     *  Falls back to `Date.now()` when `startedAt` is not provided. */
    startSynced: (timeLimitSeconds: number, startedAt?: number) => void;
    stop: () => void;
    reset: () => void;
    getElapsedSeconds: () => number;
}

export function useCountdownTimer(): CountdownTimerState {
    const [timeLimit, setTimeLimit] = useState(0);
    const [timer, setTimer] = useState(0);

    const startTimeMsRef = useRef<number | null>(null);
    const runningRef = useRef(false);
    // Incremented on each start/startSynced so the interval effect re-runs only
    // when a new countdown session begins, not on every tick.
    const [sessionId, setSessionId] = useState(0);
    const intervalRef = useRef<number | null>(null);

    const start = useCallback((timeLimitSeconds: number) => {
        const normalized = Math.max(0, Math.round(timeLimitSeconds));
        setTimeLimit(normalized);
        setTimer(normalized);
        startTimeMsRef.current = Date.now();
        runningRef.current = true;
        setSessionId((s) => s + 1);
    }, []);

    const startSynced = useCallback((timeLimitSeconds: number, startedAt?: number) => {
        const ref = typeof startedAt === 'number' ? startedAt : Date.now();
        const elapsedSec = (Date.now() - ref) / 1000;
        const remaining = Math.max(0, timeLimitSeconds - elapsedSec);
        const normalized = Math.max(0, Math.round(remaining));
        // If sync math collapses to 0 but the time limit is positive, start from the full limit
        // to guard against clock skew between admin and player browsers.
        const safeTimer = normalized > 0 ? normalized : Math.max(0, Math.round(timeLimitSeconds));
        console.info(`[BP TIMER DEBUG] startSynced called: timeLimit=${timeLimitSeconds}s, startedAt=${startedAt}, elapsedSec=${elapsedSec.toFixed(3)}, remaining=${remaining.toFixed(3)}, normalized=${normalized}, safeTimer=${safeTimer}`);
        setTimeLimit(safeTimer);
        setTimer(safeTimer);
        startTimeMsRef.current = Date.now();
        runningRef.current = true;
        setSessionId((s) => s + 1);
        console.info(`[BP TIMER DEBUG] startSynced state after: timeLimit=${safeTimer}, timer=${safeTimer}, running=${runningRef.current}`);
    }, []);

    const stop = useCallback(() => {
        runningRef.current = false;
        if (intervalRef.current !== null) {
            window.clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
    }, []);

    const reset = useCallback(() => {
        runningRef.current = false;
        startTimeMsRef.current = null;
        if (intervalRef.current !== null) {
            window.clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
        setTimeLimit(0);
        setTimer(0);
    }, []);

    const getElapsedSeconds = useCallback(() => {
        if (startTimeMsRef.current === null) return 0;
        return (Date.now() - startTimeMsRef.current) / 1000;
    }, []);

    // One stable interval per countdown session — does not restart every tick.
    useEffect(() => {
        if (!runningRef.current) return;

        if (intervalRef.current !== null) {
            window.clearInterval(intervalRef.current);
            intervalRef.current = null;
        }

        intervalRef.current = window.setInterval(() => {
            if (!runningRef.current) {
                if (intervalRef.current !== null) {
                    window.clearInterval(intervalRef.current);
                    intervalRef.current = null;
                }
                return;
            }
            setTimer((prev) => {
                const next = Math.max(0, prev - 1);
                if (next === 0) {
                    runningRef.current = false;
                    if (intervalRef.current !== null) {
                        window.clearInterval(intervalRef.current);
                        intervalRef.current = null;
                    }
                }
                return next;
            });
        }, 1000);

        return () => {
            if (intervalRef.current !== null) {
                window.clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sessionId]);

    const timerDisplay = useMemo(() => timer.toString().padStart(2, "0"), [timer]);

    return {
        timeLimit,
        timer,
        timerDisplay,
        start,
        startSynced,
        stop,
        reset,
        getElapsedSeconds,
    };
}
