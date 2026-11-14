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
                    label: COPY.startClock,
                    onClick: ctx.watchRunning ? undefined : ctx.toggleWatch,
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
                onRoundClick={openRounds}
                right={
                    oral?.playerId ? (
                        <>
                            <Progress total={oral.total} done={oral.index} active={oral.index} />
                            <Timer
                                remaining={ctx.watchRunning ? remainingMs : null}
                                fallback={String(Math.ceil(remainingMs / 1000))}
                            />
                        </>
                    ) : null
                }
                question={
                    oral?.question?.questionText ??
                    (!oral
                        ? "Lượt đã xong — bấm Hết lượt để chuyển người chơi."
                        : oral.playerId
                          ? ""
                          : "Chưa chọn người chơi — bấm thẻ bên phải.")
                }
                media={oral?.question?.media ?? null}
            />
        </ConsoleStage>
    )
}
