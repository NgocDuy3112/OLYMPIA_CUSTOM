import { useState, type ReactNode } from "react"
import { ConsoleStage, Progress, QuestionCard, Rail, Timer } from "@/components/stage/deck"
import { backToLobbyAction, verdictActions } from "@/components/stage/actions"
import type { ScreenCore } from "@/rounds/types"
import { COPY } from "@shared/deck/copy"

export type KhoiDongRiengCtx = ScreenCore & {
    oralRemaining: number | null
}

export function KhoiDongRiengAOCController({ ctx }: { ctx: KhoiDongRiengCtx }) {
    const { v, baseCards, flash } = ctx
    const oral = v.projection.oral
    const counting = oral?.deadlineAt != null && (ctx.oralRemaining ?? 0) > 0
    const canVerdict = Boolean(oral?.playerId) && counting
    const [marked, setMarked] = useState<string | null>(null)
    const mark = (id: string) => {
        setMarked(id)
        ctx.send({ kind: "khoi-dong.setTurn", playerId: id })
    }
    const record = (correct: boolean) => {
        const base = {
            kind: "khoi-dong.recordOral" as const,
            correct,
            spentS: 0,
        }
        if (marked) {
            ctx.send({ ...base, playerId: marked })
        } else {
            ctx.send(base)
        }
    }
    let cards = baseCards
    if (marked) {
        cards = baseCards.map((c) => {
            if (c.id === marked) return { ...c, ring: "selected" as const }
            return c
        })
    }

    let startClock: (() => void) | undefined = undefined
    if (marked) {
        if (oral) {
            if (oral.deadlineAt === null) startClock = () => ctx.send({ kind: "khoi-dong.startClock" })
        }
    }
    let oralTimerRemaining: number | null = null
    if (counting) oralTimerRemaining = ctx.oralRemaining
    let questionTotal = 6
    let questionDone = 0
    if (oral) {
        questionTotal = oral.total
        questionDone = oral.index
    }
    const rightSlot: ReactNode = (
        <>
            <Progress total={questionTotal} done={questionDone} active={questionDone} />
            <Timer remaining={oralTimerRemaining} />
        </>
    )
    let questionText: string | null = null
    if (oral) questionText = oral.question?.questionText ?? null

    return (
        <ConsoleStage
            rail={<Rail cards={cards} onSelect={mark} onScoreClick={ctx.openRegrade} />}
            actions={[
                {
                    label: COPY.startClock,
                    onClick: startClock,
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
