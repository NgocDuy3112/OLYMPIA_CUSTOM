import { useEffect, useState } from "react"

export interface ConsoleWatch {
    running: boolean
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

const sameAs = (w: WatchState, qid: string | null): boolean =>
    w.qid === qid || (w.running && w.qid === null && qid !== null)

const adopt = (w: WatchState, qid: string | null): WatchState =>
    w.qid === null && qid !== null ? { ...w, qid } : w

export function useConsoleWatch(oralQuestionId: string | null): ConsoleWatch {
    const [watch, setWatch] = useState<WatchState>(() => freshWatch(null))

    const effective = sameAs(watch, oralQuestionId)
        ? adopt(watch, oralQuestionId)
        : freshWatch(oralQuestionId)

    useEffect(() => {
        if (!effective.running) return
        const id = setInterval(() => {
            setWatch((w) =>
                w.running
                    ? { ...adopt(w, oralQuestionId), shown: w.base + (Date.now() - w.startedAt) }
                    : w
            )
        }, TICK_MS)
        return () => clearInterval(id)
    }, [effective.running, oralQuestionId])

    const toggle = () =>
        setWatch((w) => {
            const cur = sameAs(w, oralQuestionId) ? adopt(w, oralQuestionId) : freshWatch(oralQuestionId)
            if (!cur.running) return { ...cur, running: true, startedAt: Date.now(), base: cur.shown }
            const shown = cur.base + (Date.now() - cur.startedAt)
            return { ...cur, running: false, startedAt: 0, base: shown, shown }
        })

    return { running: effective.running, ms: effective.shown, toggle }
}
