import { useState } from "react"
import type { LiveAction } from "@/lib/live-actions"

interface ConsoleAdjust {
    adjustFor: string | null
    openAdjust: (userId: string) => void
    closeAdjust: () => void
    submitAdjust: (delta: number, reason: string) => void
}

export function useConsoleAdjust(send: (action: LiveAction) => void): ConsoleAdjust {
    const [adjustFor, setAdjustFor] = useState<string | null>(null)

    return {
        adjustFor,
        openAdjust: (userId: string) => setAdjustFor(userId),
        closeAdjust: () => setAdjustFor(null),
        submitAdjust: (delta: number, reason: string) => {
            if (!adjustFor) return
            setAdjustFor(null) 
            send({ kind: "score.adjust", userId: adjustFor, delta, reason })
        },
    }
}
