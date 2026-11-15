import { useState, type ReactNode } from "react"
import { COPY } from "@shared/deck/copy"
import { ConsoleStage, Progress, QuestionCard, Rail, Timer } from "@/components/stage/deck"
import { backToLobbyAction, verdictActions } from "@/components/stage/actions"

import type { ScreenCore } from "../types"

export type KhoiDongRiengCtx = ScreenCore & {
    watchRunning: boolean
    watchMs: number
    toggleWatch: () => void
}

export function KhoiDongRiengAOCController({ ctx }: { ctx: KhoiDongRiengCtx }) {
    const { v, baseCards, flash } = ctx
    const oral = v.projection.oral
    let budgetSeconds = 45
    if (oral) budgetSeconds = Math.max(0, oral.budgetS - oral.elapsedS)
    const budgetMs = budgetSeconds * 1000
    const remainingMs = Math.max(0, budgetMs - ctx.watchMs)
    let overBudget = false
    if (oral) overBudget = ctx.watchMs > budgetMs
    const canVerdict = Boolean(oral?.playerId) && !overBudget
    const spentS = Math.max(0, Math.floor(ctx.watchMs / 1000))
    const [marked, setMarked] = useState<string | null>(null)
    const mark = (id: string) => {
        setMarked(id)
        ctx.send({ kind: "khoi-dong.setTurn", playerId: id })
    }
    const record = (correct: boolean) => {
        const base = {
            kind: "khoi-dong.recordOral" as const,
            correct,
            spentS,
        }
        if (marked) {
            ctx.send({ ...base, playerId: marked })
        } else {
            ctx.send(base)
        }
        setMarked(null)
    }
    let cards = baseCards
    if (marked) {
        cards = baseCards.map((c) => {
            if (c.id === marked) return { ...c, ring: "selected" as const }
            return c
        })
    }

    let toggleWatch: (() => void) | undefined = ctx.toggleWatch
    if (ctx.watchRunning) toggleWatch = undefined
    let oralTimerRemaining: number | null = null
    if (ctx.watchRunning) oralTimerRemaining = remainingMs
    let rightSlot: ReactNode = null
    if (oral?.playerId) {
        rightSlot = (
            <>
                <Progress total={oral.total} done={oral.index} active={oral.index} />
                <Timer
                    remaining={oralTimerRemaining}
                    fallback={String(Math.ceil(remainingMs / 1000))}
                />
            </>
        )
    }
    let questionStarted = false
    if (ctx.watchRunning) questionStarted = true
    if (ctx.watchMs > 0) questionStarted = true
    let questionText: string | null = null
    if (questionStarted) {
        if (oral) {
            const asked = v.questions.find((q) => q._id === oral.questionId)
            questionText = asked?.questionText ?? oral.question?.questionText ?? null
        }
    }

    return (
        <ConsoleStage
            rail={<Rail variant="compact" cards={cards} onSelect={mark} />}
            actions={[
                {
                    label: COPY.startClock,
                    onClick: toggleWatch,
                },
                ...verdictActions({ canVerdict, onVerdict: record }),
                {
                    label: "Hết lượt",
                    onClick: () => ctx.send({ kind: "khoi-dong.timeOutRun" }),
                },
                backToLobbyAction(ctx.backToLobby),
            ]}
            flash={flash}
        >
            <QuestionCard
                round="Khởi động"
                mode="Lượt cá nhân"
                right={rightSlot}
                question={questionText}
                media={oral?.question?.media ?? null}
            />
        </ConsoleStage>
    )
}
