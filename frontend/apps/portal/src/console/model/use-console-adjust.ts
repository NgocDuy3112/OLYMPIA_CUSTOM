// The score-adjust dialog's state (the controller's match-level correction).
//
// One audited row in the backend ledger, folded into the scoreboard and the
// final results — so the console only owns "which player, and the three
// callbacks". Kept out of the model because it is a DIALOG, not a round rule.
import { useState } from "react"
import type { LiveAction } from "@/lib/live-actions"

export interface ConsoleAdjust {
    /** the player the dialog is open for (null: closed) */
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
            setAdjustFor(null) // the refusal flash carries any failure
            send({ kind: "score.adjust", userId: adjustFor, delta, reason })
        },
    }
}
