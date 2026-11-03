// The console's STOPWATCH (khởi động's oral run).
//
// One state machine, one question scope: the watch belongs to the question the
// oral run is on, so moving to another question reads as a fresh, stopped watch
// without an effect to clear it (the same trick giai-ma's multi-select uses).
//
// The interval lives here — never in a screen — because `shown` is what makes
// the render pure: the deck reads `ms`, and only this updater reads `Date.now`.
import { useEffect, useState } from "react"

export interface ConsoleWatch {
    running: boolean
    /** elapsed milliseconds, ticked ~4×/s while running */
    ms: number
    toggle: () => void
}

interface WatchState {
    qid: string | null
    running: boolean
    startedAt: number
    base: number
    shown: number
}

const freshWatch = (qid: string | null): WatchState =>
    ({ qid, running: false, startedAt: 0, base: 0, shown: 0 })

const TICK_MS = 250

/**
 * The operator's stopwatch, scoped to `oralQuestionId` (null when no oral run
 * is open — the watch then holds an empty, stopped state).
 */
export function useConsoleWatch(oralQuestionId: string | null): ConsoleWatch {
    const [watch, setWatch] = useState<WatchState>(() => freshWatch(null))
    // A watch whose qid no longer matches the open run is not this run's watch.
    const effective = watch.qid === oralQuestionId ? watch : freshWatch(oralQuestionId)

    useEffect(() => {
        if (!watch.running) return
        const id = setInterval(() => {
            setWatch((w) => (w.running ? { ...w, shown: w.base + (Date.now() - w.startedAt) } : w))
        }, TICK_MS)
        return () => clearInterval(id)
    }, [watch.running])

    // `shown` comes from the interval — render stays pure (no Date.now here):
    // the stopwatch reads the clock only inside this state updater.
    const toggle = () =>
        setWatch((w) => {
            const cur = w.qid === oralQuestionId ? w : freshWatch(oralQuestionId)
            if (!cur.running) return { ...cur, running: true, startedAt: Date.now(), base: cur.shown }
            const shown = cur.base + (Date.now() - cur.startedAt)
            return { ...cur, running: false, startedAt: 0, base: shown, shown }
        })

    return { running: effective.running, ms: effective.shown, toggle }
}
