import { useState } from "react"
import { ConsoleStage, QuestionCard, QuestionChips, Rail, Timer } from "@/components/stage/deck"
import { backToLobbyAction, verdictActions } from "@/components/stage/actions"
import { COPY } from "@shared/deck/copy"
import type { LiveAction } from "@/lib/live-actions"
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

    const openNow = projection.open[0]
    const boardCells = projection.board ?? []
    const openCell = openNow ? boardCells.find((c) => c.questionId === openNow.questionId) ?? null : null
    const nextPendingId = consoleVeDich?.pendingQuestionId ?? null
    const nextPendingCell = nextPendingId ? boardCells.find((c) => c.questionId === nextPendingId) ?? null : null
    const stripCells = [openCell, nextPendingCell].filter((c): c is NonNullable<typeof c> => c !== null)
    const revealed = consoleVeDich?.revealed ?? false
    const qid = openNow.questionId
    let needsVerdict = true
    if (consoleVeDich?.answererId) needsVerdict = ctx.verdictOf(qid, consoleVeDich.answererId) === null
    let buzzerMissing = false
    if (consoleVeDich?.buzzerId) buzzerMissing = ctx.verdictOf(qid, consoleVeDich.buzzerId) === null
    const turnOpen = needsVerdict || buzzerMissing

    const racing = consoleVeDich?.power === "ASSIGN"
    const canLockBuzz = consoleVeDich?.openStage === "buzz" && consoleVeDich.buzzerId === null

    let counting = false
    if (openNow?.deadlineAt && (remaining ?? 0) > 0) counting = true

    const powerStorable = consoleVeDich?.phase === 2
        && consoleVeDich?.openStage === "current"
        && revealed === false
        && counting === false
        && consoleVeDich?.turnPowerUsed === false
        && consoleVeDich?.turnPlayerId !== null
    const [assignArmed, setAssignArmed] = useState(false)
    const declarePower = (power: "STAR" | "ASSIGN", targetId?: string) => {
        const playerId = consoleVeDich?.turnPlayerId
        if (!playerId) return
        ctx.send({ kind: "ve-dich.declarePower", playerId, power, targetId })
        setAssignArmed(false)
    }
    const stageStar: (() => void) | undefined = powerStorable
        ? () => declarePower("STAR")
        : undefined
    const armAssign: (() => void) | undefined = powerStorable
        ? () => setAssignArmed(true)
        : undefined

    const railSelect = (id: string) => {
        if (assignArmed) {
            declarePower("ASSIGN", id)
            return
        }
        ctx.toggleSelect(id)
    }

    let startClock: (() => void) | undefined = undefined
    if (openNow) {
        if (revealed) {
            if (consoleVeDich?.openStage === "current") {
                if (!counting) startClock = () => ctx.send({ kind: "ve-dich.startClock" })
            }
        }
    }

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
    let timerRemaining: number | null = null
    if (openNow?.deadlineAt) timerRemaining = remaining
    else if (typeof openNow?.frozenRemainingMs === "number") timerRemaining = openNow.frozenRemainingMs

    return (
        <ConsoleStage
            rail={<Rail cards={baseCards} onSelect={railSelect} />}
            actions={[
                {
                    label: COPY.powerStar,
                    onClick: stageStar,
                    content: !powerStorable && consoleVeDich?.turnPowerUsed === true ? "đã chốt" : undefined,
                    muted: !powerStorable,
                },
                {
                    label: COPY.powerAssign,
                    onClick: armAssign,
                    content: assignArmed ? "chọn thẻ để chỉ định" : undefined,
                    muted: !powerStorable,
                },
                {
                    label: COPY.startClock,
                    onClick: startClock,
                },
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
                right={
                    <span className="flex items-center gap-[1.2cqw]">
                        <QuestionChips
                            chips={stripCells.map((cell) => ({
                                id: cell.questionId,
                                label: String(cell.value),
                                active: cell.where === "open",
                                clickable: cell.where === "open" && !revealed,
                            }))}
                            onSelect={(id: string) => {
                                const actions: LiveAction[] = []
                                if (openNow === null) {
                                    actions.push({ kind: "ve-dich.openQuestion", questionId: id })
                                } else if (id !== openNow.questionId) {
                                    actions.push({ kind: "ve-dich.switchQuestion", questionId: id })
                                }
                                if (!revealed) actions.push({ kind: "ve-dich.reveal" })
                                if (actions.length > 0) void ctx.sendChain(actions)
                            }}
                        />
                        <Timer remaining={timerRemaining} />
                    </span>
                }
                question={openNow.question?.questionText ?? ""}
                media={openNow.question?.media ?? null}
            />
        </ConsoleStage>
    )
}
