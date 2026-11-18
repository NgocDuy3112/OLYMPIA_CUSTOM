import { useState } from "react"
import type { LiveAction } from "@/lib/live-actions"

interface ConsoleAdjust {
    adjustFor: string | null
    openAdjust: (userId: string) => void
    closeAdjust: () => void
    submitAdjust: (delta: number, reason: string) => void
    regradeFor: string | null
    openRegrade: (userId: string) => void
    closeRegrade: () => void
    submitRegrade: (questionId: string, delta: number) => void
}

export function useConsoleAdjust(send: (action: LiveAction) => void): ConsoleAdjust {
    const [adjustFor, setAdjustFor] = useState<string | null>(null)
    const [regradeFor, setRegradeFor] = useState<string | null>(null)

    return {
        adjustFor,
        openAdjust: (userId: string) => setAdjustFor(userId),
        closeAdjust: () => setAdjustFor(null),
        submitAdjust: (delta: number, reason: string) => {
            if (!adjustFor) return
            setAdjustFor(null)
            send({ kind: "score.adjust", userId: adjustFor, delta, reason })
        },
        regradeFor,
        openRegrade: (userId: string) => setRegradeFor(userId),
        closeRegrade: () => setRegradeFor(null),
        submitRegrade: (questionId: string, delta: number) => {
            if (!regradeFor) return
            setRegradeFor(null)
            send({ kind: "answer.regrade", questionId, playerId: regradeFor, delta })
        },
    }
}
