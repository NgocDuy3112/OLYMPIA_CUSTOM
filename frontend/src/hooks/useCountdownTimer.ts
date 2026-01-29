import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export interface CountdownTimerState {
    timeLimit: number;
    timer: number;
    timerDisplay: string;
    start: (timeLimitSeconds: number) => void;
    stop: () => void;
    reset: () => void;
    getElapsedSeconds: () => number;
}

export function useCountdownTimer(): CountdownTimerState {
    const [timeLimit, setTimeLimit] = useState(0);
    const [timer, setTimer] = useState(0);

    const startTimeMsRef = useRef<number | null>(null);
    const runningRef = useRef(false);

    const start = useCallback((timeLimitSeconds: number) => {
        const normalized = Math.max(0, Math.floor(timeLimitSeconds));
        setTimeLimit(normalized);
        setTimer(normalized);
        startTimeMsRef.current = Date.now();
        runningRef.current = true;
    }, []);

    const stop = useCallback(() => {
        runningRef.current = false;
    }, []);

    const reset = useCallback(() => {
        runningRef.current = false;
        startTimeMsRef.current = null;
        setTimeLimit(0);
        setTimer(0);
    }, []);

    const getElapsedSeconds = useCallback(() => {
        if (startTimeMsRef.current === null) return 0;
        return (Date.now() - startTimeMsRef.current) / 1000;
    }, []);

    useEffect(() => {
        if (!runningRef.current) return;
        if (timer <= 0) return;

        const id = window.setInterval(() => {
            setTimer((prev) => {
                if (!runningRef.current) return prev;
                return Math.max(0, prev - 1);
            });
        }, 1000);

        return () => window.clearInterval(id);
    }, [timer]);

    useEffect(() => {
        if (timer === 0) {
            runningRef.current = false;
        }
    }, [timer]);

    const timerDisplay = useMemo(() => timer.toString().padStart(2, "0"), [timer]);

    return {
        timeLimit,
        timer,
        timerDisplay,
        start,
        stop,
        reset,
        getElapsedSeconds,
    };
}
