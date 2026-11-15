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

const adopt = (w: WatchState, qid: string | null): WatchState => {
    if (w.qid === null) {
        if (qid !== null) return { ...w, qid }
    }
    return w
}

export function useConsoleWatch(oralQuestionId: string | null): ConsoleWatch {
    const [watch, setWatch] = useState<WatchState>(() => freshWatch(null))

    let effective = freshWatch(oralQuestionId)
    if (sameAs(watch, oralQuestionId)) effective = adopt(watch, oralQuestionId)

    useEffect(() => {
        if (!effective.running) return
        const id = setInterval(() => {
            setWatch((w) => {
                if (w.running) {
                    const adopted = adopt(w, oralQuestionId)
                    return { ...adopted, shown: w.base + (Date.now() - w.startedAt) }
                }
                return w
            })
        }, TICK_MS)
        return () => clearInterval(id)
    }, [effective.running, oralQuestionId])

    const toggle = () =>
        setWatch((w) => {
            let cur = freshWatch(oralQuestionId)
            if (sameAs(w, oralQuestionId)) cur = adopt(w, oralQuestionId)
            if (!cur.running) return { ...cur, running: true, startedAt: Date.now(), base: cur.shown }
            const shown = cur.base + (Date.now() - cur.startedAt)
            return { ...cur, running: false, startedAt: 0, base: shown, shown }
        })

    return { running: effective.running, ms: effective.shown, toggle }
}
