import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export interface CountdownTimerState {
    timeLimit: number;
    timer: number;
    timerDisplay: string;
    start: (timeLimitSeconds: number) => void;

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
        const now = Date.now();

        let ref = typeof startedAt === 'number' ? startedAt : now;
        let clampedFromFuture = false;
        if (ref > now) {
            ref = now;
            clampedFromFuture = true;
        }

        const elapsedSec = (now - ref) / 1000;
        const remaining = Math.max(0, timeLimitSeconds - elapsedSec);
        const normalized = Math.max(0, Math.round(remaining));

        const safeTimer = normalized > 0 ? normalized : Math.max(0, Math.round(timeLimitSeconds));
        const finalTimer = safeTimer > 0 ? safeTimer : timeLimitSeconds;

        if (clampedFromFuture) {

            console.warn(
                `[useCountdownTimer] startSynced: startedAt was ${typeof startedAt === 'number' ? startedAt : 'n/a'} (in the future), clamped to Date.now(). timeLimit=${timeLimitSeconds}s`,
            );
        }

        setTimeLimit(finalTimer);
        setTimer(finalTimer);
        startTimeMsRef.current = Date.now();
        runningRef.current = true;
        setSessionId((s) => s + 1);
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
