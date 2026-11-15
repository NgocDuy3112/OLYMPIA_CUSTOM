import { ConsoleStage, QuestionCard, Rail, Timer, VeDichStripCells } from "@/components/stage/deck"
import { backToLobbyAction, verdictActions } from "@/components/stage/actions"
import { COPY } from "@shared/deck/copy"
import { formatDurationMs } from "@shared/lib/clock"

import type { VeDichConsole } from "@/lib/live"
import type { ScreenCore } from "../types"

export type VeDichRiengCtx = ScreenCore & {
    remaining: number | null
    consoleVeDich: VeDichConsole | null
    target: string | null
    setVerdict: (correct: boolean) => void
    setSelectedPlayer: (userId: string) => void
    verdictOf: (questionId: string, userId: string) => "CORRECT" | "INCORRECT" | null
    hetLuot: () => void
}

export function VeDichRiengAOCController({ ctx }: { ctx: VeDichRiengCtx }) {
    const { v, remaining, baseCards, consoleVeDich, flash } = ctx
    const projection = v.projection

    const stripCells = (projection.board ?? []).filter((c) => c.where === "open" || c.where === "pending")
    const openNow = projection.open[0]
    const revealed = consoleVeDich?.revealed ?? false
    const qid = openNow.questionId
    let needsVerdict = true
    if (consoleVeDich?.answererId) needsVerdict = ctx.verdictOf(qid, consoleVeDich.answererId) === null
    let buzzerMissing = false
    if (consoleVeDich?.buzzerId) buzzerMissing = ctx.verdictOf(qid, consoleVeDich.buzzerId) === null
    const turnOpen = needsVerdict || buzzerMissing

    const racing = consoleVeDich?.power === "ASSIGN"
    const canLockBuzz = consoleVeDich?.openStage === "buzz" && consoleVeDich.buzzerId === null

    let closeCurrent: (() => void) | undefined = undefined
    if (consoleVeDich?.openStage === "current") {
        if (!racing) closeCurrent = () => ctx.send({ kind: "ve-dich.closeCurrentAnswer" })
    }
    let lockBuzz: (() => void) | undefined = undefined
    if (canLockBuzz) lockBuzz = () => ctx.send({ kind: "ve-dich.lockBuzz" })
    let buzzText = "—"
    if (consoleVeDich?.buzzerMs != null) buzzText = formatDurationMs(consoleVeDich.buzzerMs)
    let endTurn: (() => void) | undefined = () => ctx.hetLuot()
    if (turnOpen) endTurn = undefined
    let reveal: (() => void) | undefined = undefined
    if (openNow) {
        if (!revealed) reveal = () => ctx.send({ kind: "ve-dich.reveal" })
    }
    let timerRemaining: number | null = null
    if (openNow?.deadlineAt) timerRemaining = remaining

    return (
        <ConsoleStage
            rail={<Rail variant="compact" cards={baseCards} onSelect={ctx.toggleSelect} />}
            actions={[
                {
                    label: "Mở chuông",
                    onClick: closeCurrent,
                },
                {
                    label: "Khoá chuông",
                    onClick: lockBuzz,
                },
                {
                    label: "Chuông",
                    content: buzzText,
                    muted: true
                },
                ...verdictActions({
                    canVerdict: ctx.target !== null || ctx.selectedIds.size > 0,
                    onVerdict: ctx.setVerdict,
                }),
                { label: COPY.endTurn, onClick: endTurn },
                backToLobbyAction(ctx.backToLobby),
            ]}
            flash={flash}
        >
            <QuestionCard
                round="Về đích"
                mode="Lượt cá nhân"
                mid={<VeDichStripCells cells={stripCells} phase2 />}
                right={<Timer remaining={timerRemaining} />}
                question={openNow.question?.questionText ?? ""}
                media={openNow.question?.media ?? null}
                onReveal={reveal}
            />
        </ConsoleStage>
    )
}
