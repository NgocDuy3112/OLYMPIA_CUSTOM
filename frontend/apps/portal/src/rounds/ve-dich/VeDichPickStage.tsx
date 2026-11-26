import { useState } from "react"
import { ConsoleStage, QuestionCard, QuestionChips, Rail, Timer, VeDichPickBoard } from "@/components/stage/deck"
import { RIENG_PICK_VALUES } from "@shared/deck/ve-dich-board"
import { backToLobbyAction } from "@/components/stage/actions"
import type { VeDichPickCtx } from "./stage"

function sameIds(a: string[], b: string[]): boolean {
    if (a.length !== b.length) return false
    return a.every((id) => b.includes(id))
}

export function VeDichPickStage({ variant, ctx }: { variant: "rieng" | "chung"; ctx: VeDichPickCtx }) {
    const { v, baseCards, flash } = ctx
    const projection = v.projection
    const rieng = variant === "rieng"
    const consoleState = v.console
    const consoleVeDich = consoleState?.roundId === "ve-dich" ? consoleState.console : null
    const turnPlayer = consoleVeDich?.turnPlayerId ?? null

    const pendingIds = (projection.board ?? [])
        .filter((c) => c.where === "pending")
        .map((c) => c.questionId)
    const pendingKey = rieng ? `${turnPlayer ?? "-"}:${pendingIds.join(",")}` : pendingIds.join(",")
    const [chosen, setChosen] = useState<string[]>(pendingIds)
    const [seenPending, setSeenPending] = useState(pendingKey)
    if (seenPending !== pendingKey) {
        setSeenPending(pendingKey)
        setChosen(pendingIds)
    }
    // A refused batch leaves the local picks ahead of the server and the pending key
    // untouched (the server never took them). A failed action is what raises `flash`,
    // and the view it carries is the last server truth — fold back onto it rather than
    // keep picks the server rejected.
    if (flash !== null && !sameIds(chosen, pendingIds)) setChosen(pendingIds)

    const boardCells = projection.board ?? []
    const stagedCells: Array<{ questionId: string; value: number }> = []
    for (const id of chosen) {
        const cell = boardCells.find((c) => c.questionId === id)
        if (cell) stagedCells.push({ questionId: cell.questionId, value: cell.value })
    }

    const openNow = projection.open[0] ?? null
    // The rule allows AT MOST `pickCount` questions per turn — one is already a
    // batch. The engine owns that number (Rules), so read it from the wire and
    // only fall back while the view does not carry it yet.
    const maxPicks = consoleVeDich?.pickCount ?? 3
    // rules.md §7.4: phase 1 stages one open question per player — the server
    // counts the same way (VeDichTurn.ConfirmPicks wants Players.Count picks).
    const need = projection.table.length
    const full = rieng ? chosen.length >= maxPicks : need > 0 && chosen.length >= need
    const pickedThisTurn = (consoleVeDich?.turnPicked ?? 0) >= 1
    const picking = openNow === null && turnPlayer !== null && (projection.selectedPlayerId ?? null) !== null

    const sendPicks = (ids: string[]) => {
        if (!turnPlayer) return
        if (!picking) return
        ctx.send({ kind: "ve-dich.pickBatch", playerId: turnPlayer, questionIds: ids })
    }

    const dropPick = (id: string) => {
        const next = chosen.filter((picked) => picked !== id)
        setChosen(next)
        sendPicks(next)
    }
    let clearPicks: (() => void) | undefined
    if (chosen.length > 0) clearPicks = () => sendPicks([])

    const togglePick = (questionId: string) => {
        if (rieng) {
            if (!picking) return
            if (chosen.includes(questionId)) {
                dropPick(questionId)
                return
            }
            if (chosen.length >= maxPicks) return
            const next = [...chosen, questionId]
            setChosen(next)
            sendPicks(next)
            return
        }
        if (chosen.includes(questionId)) {
            const next = chosen.filter((picked) => picked !== questionId)
            setChosen(next)
            ctx.send({ kind: "ve-dich.pickRound", questionIds: next })
            return
        }
        if (chosen.length >= need) return
        const next = [...chosen, questionId]
        setChosen(next)
        ctx.send({ kind: "ve-dich.pickRound", questionIds: next })
    }

    let confirmPicks: (() => void) | undefined = undefined
    if (pickedThisTurn) {
        if (consoleVeDich?.pendingQuestionId != null) {
            confirmPicks = () => ctx.send({ kind: "ve-dich.confirmPicks" })
        }
    }
    // Xác nhận locks the whole batch server-side, so it also waits for the server to
    // hold exactly that batch: VeDichTurn.ConfirmPicks refuses any count but Players.Count.
    const ready = full && pendingIds.length === need

    return (
        <ConsoleStage
            // Phase 1 has no per-player turn — the batch is shared, so a rail click has
            // no server action behind it and must not offer one.
            rail={rieng
                ? <Rail cards={baseCards} onSelect={(id) => ctx.send({ kind: "ve-dich.setTurn", playerId: id })} onScoreClick={ctx.openRegrade} />
                : <Rail cards={baseCards} onScoreClick={ctx.openRegrade} />}
            actions={rieng ? [
                {
                    label: "Xác nhận",
                    onClick: confirmPicks,
                },
                {
                    label: "Chọn lại",
                    onClick: clearPicks,
                },
                backToLobbyAction(ctx.backToLobby),
            ] : [
                {
                    label: "Xác nhận",
                    onClick: ready
                        ? () => ctx.send({ kind: "ve-dich.confirmPicks" })
                        : undefined,
                },
                {
                    label: "Chọn lại",
                    onClick: chosen.length > 0
                        ? () => {
                            setChosen([])
                            ctx.send({ kind: "ve-dich.clearPicks" })
                        }
                        : undefined,
                },
                backToLobbyAction(ctx.backToLobby),
            ]}
            flash={flash}
        >
            <QuestionCard
                round="Về đích"
                mode={rieng ? "Lượt cá nhân" : "Lượt chung"}
                right={
                    <span className="flex items-center gap-[1.2cqw]">
                        <QuestionChips
                            chips={stagedCells.map((cell) => ({
                                id: cell.questionId,
                                label: String(cell.value),
                                active: true,
                                // A staged pick is not on stage yet — only the open question breathes.
                                live: false,
                                clickable: rieng ? picking : true,
                                title: `Bỏ câu ${cell.value} điểm`,
                            }))}
                            onSelect={(id: string) => {
                                if (rieng) {
                                    dropPick(id)
                                    return
                                }
                                togglePick(id)
                            }}
                        />
                        <Timer remaining={null} />
                    </span>
                }
            >
                {rieng
                    ? <VeDichPickBoard
                        cells={boardCells}
                        pickedIds={chosen}
                        values={RIENG_PICK_VALUES}
                        locked={turnPlayer === null || (projection.selectedPlayerId ?? null) === null}
                        full={full}
                        onPick={picking ? togglePick : undefined}
                    />
                    : <VeDichPickBoard cells={boardCells} pickedIds={chosen} full={full} onPick={togglePick} />}
            </QuestionCard>
        </ConsoleStage>
    )
}
