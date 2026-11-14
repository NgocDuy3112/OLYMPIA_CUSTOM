import { useState } from "react"
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
    const { v, baseCards, flash, openRounds } = ctx
    const oral = v.projection.oral
    const budgetMs = (oral ? Math.max(0, oral.budgetS - oral.elapsedS) : 45) * 1000
    const remainingMs = Math.max(0, budgetMs - ctx.watchMs)
    const overBudget = oral ? ctx.watchMs > budgetMs : false
    const canVerdict = Boolean(oral?.playerId) && !overBudget
    const spentS = Math.max(0, Math.floor(ctx.watchMs / 1000))
    // the card marked as who is answering — it moves the engine's cursor so
    // their question appears, and is spent on the verdict
    const [marked, setMarked] = useState<string | null>(null)
    const mark = (id: string) => {
        setMarked(id)
        ctx.send({ kind: "khoi-dong.setTurn", playerId: id })
    }
    const record = (correct: boolean) => {
        ctx.send({
            kind: "khoi-dong.recordOral",
            correct,
            spentS,
            ...(marked ? { playerId: marked } : {}),
        })
        setMarked(null)
    }
    const cards = marked
        ? baseCards.map((c) => (c.id === marked ? { ...c, ring: "selected" as const } : c))
        : baseCards

    return (
        <ConsoleStage
            rail={<Rail variant="compact" cards={cards} onSelect={mark} />}
            actions={[
                {
                    // one-way: it runs in the corner, so the slot goes inert
                    label: COPY.startClock,
                    onClick: ctx.watchRunning ? undefined : ctx.toggleWatch,
                },
                ...verdictActions({ canVerdict, onVerdict: record }),
                backToLobbyAction(ctx.backToLobby),
            ]}
            flash={flash}
        >
            <QuestionCard
                round="Khởi động"
                mode="Lượt cá nhân"
                onRoundClick={openRounds}
                right={
                    <>
                        <Progress total={oral?.total ?? 6} done={oral?.index ?? 0} active={oral?.playerId ? oral.index : -1} />
                        <Timer
                            remaining={ctx.watchRunning ? remainingMs : null}
                            fallback={String(Math.ceil(remainingMs / 1000))}
                        />
                    </>
                }
                question={oral?.question?.questionText ?? ""}
                media={oral?.question?.media ?? null}
            />
        </ConsoleStage>
    )
}
