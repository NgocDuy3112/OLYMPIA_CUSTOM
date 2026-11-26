import { useState } from "react"
import { errorMessage } from "@shared/lib/error-text"
import type { Projection } from "@shared/wire/live"
import type { LiveAction } from "@/lib/live-actions"

interface PendingAdjust {
    userId: string
    baseline: number | null | undefined
}

interface PendingRegrade {
    questionId: string
    playerId: string
    baseline: number | null | undefined
}

interface ConsoleAdjustInput {
    sendScore: (action: LiveAction) => Promise<void>
    projection: Projection | undefined
}

export interface ConsoleAdjust {
    adjustFor: string | null
    adjustPending: boolean
    adjustError: string | null
    openAdjust: (userId: string) => void
    closeAdjust: () => void
    submitAdjust: (delta: number, reason: string) => void
    regradeFor: string | null
    regradePending: boolean
    regradeError: string | null
    openRegrade: (userId: string) => void
    closeRegrade: () => void
    submitRegrade: (questionId: string, delta: number) => void
}

export function useConsoleAdjust(input: ConsoleAdjustInput): ConsoleAdjust {
    const [adjustFor, setAdjustFor] = useState<string | null>(null)
    const [adjustAwaiting, setAdjustAwaiting] = useState<PendingAdjust | null>(null)
    const [adjustError, setAdjustError] = useState<string | null>(null)
    const [regradeFor, setRegradeFor] = useState<string | null>(null)
    const [regradeAwaiting, setRegradeAwaiting] = useState<PendingRegrade | null>(null)
    const [regradeError, setRegradeError] = useState<string | null>(null)

    const projection = input.projection

    const adjustPoints = adjustAwaiting === null
        ? undefined
        : projection?.table.find((row) => row.id === adjustAwaiting.userId)?.points
    const adjustConfirmed = adjustAwaiting !== null && adjustPoints !== adjustAwaiting.baseline
    const adjustPending = adjustAwaiting !== null && !adjustConfirmed

    const regradePoints = regradeAwaiting === null
        ? undefined
        : projection?.answers?.find(
            (row) =>
                row.questionId === regradeAwaiting.questionId
                && row.userId === regradeAwaiting.playerId
        )?.pointsAwarded
    const regradeConfirmed = regradeAwaiting !== null && regradePoints !== regradeAwaiting.baseline
    const regradePending = regradeAwaiting !== null && !regradeConfirmed

    const openAdjust = (userId: string) => {
        setAdjustAwaiting(null)
        setAdjustError(null)
        setAdjustFor(userId)
    }
    const closeAdjust = () => {
        if (adjustPending) return
        setAdjustAwaiting(null)
        setAdjustError(null)
        setAdjustFor(null)
    }
    const submitAdjust = (delta: number, reason: string) => {
        if (!adjustFor || adjustPending) return
        const userId = adjustFor
        const baseline = projection?.table.find((row) => row.id === userId)?.points
        setAdjustError(null)
        setAdjustAwaiting({ userId, baseline })
        void input.sendScore({ kind: "score.adjust", userId, delta, reason }).catch((error) => {
            setAdjustAwaiting(null)
            setAdjustError(errorMessage(error))
        })
    }

    const openRegrade = (userId: string) => {
        setRegradeAwaiting(null)
        setRegradeError(null)
        setRegradeFor(userId)
    }
    const closeRegrade = () => {
        if (regradePending) return
        setRegradeAwaiting(null)
        setRegradeError(null)
        setRegradeFor(null)
    }
    const submitRegrade = (questionId: string, delta: number) => {
        if (!regradeFor || regradePending) return
        const playerId = regradeFor
        const baseline = projection?.answers?.find(
            (row) => row.questionId === questionId && row.userId === playerId
        )?.pointsAwarded
        setRegradeError(null)
        setRegradeAwaiting({ questionId, playerId, baseline })
        void input.sendScore({ kind: "answer.regrade", questionId, playerId, delta }).catch((error) => {
            setRegradeAwaiting(null)
            setRegradeError(errorMessage(error))
        })
    }

    return {
        adjustFor: adjustConfirmed ? null : adjustFor,
        adjustPending,
        adjustError,
        openAdjust,
        closeAdjust,
        submitAdjust,
        regradeFor: regradeConfirmed ? null : regradeFor,
        regradePending,
        regradeError,
        openRegrade,
        closeRegrade,
        submitRegrade,
    }
}
