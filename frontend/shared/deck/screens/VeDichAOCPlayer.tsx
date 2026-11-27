import type { ReactNode } from "react"
import { Hand } from "lucide-react"
import {
    AnswerBand,
    AudienceFace,
    PlayerStage,
    QuestionCard,
    QuestionChips,
    Rail,
    Timer,
    type PlayerCore,
    SubmissionLog,
    type SubmissionEntry,
} from "../player-deck"
import { pt, STRIP_R } from "../geometry"
import { playerTurnChips, RIENG_PICK_VALUES } from "../ve-dich-board"
import { VeDichPickBoard } from "../ve-dich-pick-board"
import { timerRemainingOf } from "@shared/lib/clock"
import { COPY } from "../copy"
import type { AnswerValue, VeDichCommand } from "../types"

type VeDichPlayerVariant = "rieng" | "chung"

export type VeDichRiengPlayerCtx = PlayerCore & {
    remaining: number
    answerBusy: boolean
    submitAnswer: (questionId: string, value: AnswerValue) => void
    cmdBusy: boolean
    command: (action: VeDichCommand) => void
}

export type VeDichChungPlayerCtx = PlayerCore & {
    remaining: number
    answerBusy: boolean
    submitAnswer: (questionId: string, value: AnswerValue) => void
}

export type VeDichPlayerProps =
    | { variant: VeDichPlayerVariant; phase: "pick"; ctx: PlayerCore }
    | { variant: "rieng"; phase: "play"; ctx: VeDichRiengPlayerCtx }
    | { variant: "chung"; phase: "play"; ctx: VeDichChungPlayerCtx }

export function VeDichAOCPlayer(props: VeDichPlayerProps) {
    if (props.phase === "pick") {
        return <VeDichPickPlayer variant={props.variant} ctx={props.ctx} />
    }
    if (props.variant === "rieng") return <VeDichPlayRieng ctx={props.ctx} />
    return <VeDichPlayChung ctx={props.ctx} />
}

function VeDichPickPlayer({ variant, ctx }: { variant: VeDichPlayerVariant; ctx: PlayerCore }) {
    const { v } = ctx
    const rieng = variant === "rieng"
    const board = v.board ?? []
    const myPicks = v.me.pendingPicks
    // The LED view carries no per-player `me.pendingPicks` (audience.ts:21), so the staged set
    // is read off the public board, where `pending` marks this turn's picks until Xác nhận.
    const stagedIds = myPicks
        ?? board.filter((cell) => cell.where === "pending").map((cell) => cell.questionId)

    const pickedCells = stagedIds.flatMap((id) => {
        const cell = board.find((c) => c.questionId === id)
        if (!cell) return []
        return [{ id: cell.questionId, value: cell.value }]
    })
    // The turn is individual, so name the picker: the deck never shows whose turn it is.
    const turnName = rieng && v.turnPlayerId ? ctx.nameOf(v.turnPlayerId) : null

    return (
        <PlayerStage
            rail={<Rail view={v} myId={ctx.myId} />}
        >
            <QuestionCard
                round="Về đích"
                mode={rieng ? "Lượt cá nhân" : "Lượt chung"}
                right={
                    <span className="flex items-center gap-[1.2cqw]">
                        {turnName && (
                            <span className="font-sans text-muted-foreground" style={{ fontSize: pt(12) }}>
                                Lượt: {turnName}
                            </span>
                        )}
                        <QuestionChips
                            chips={pickedCells.map((cell) => ({
                                id: cell.id,
                                label: String(cell.value),
                                active: true,
                                // A staged pick is not on stage yet — only the open question breathes.
                                live: false,
                                title: `Đã chọn câu ${cell.value} điểm`,
                            }))}
                        />
                        <Timer remaining={null} />
                    </span>
                }
            >
                {rieng
                    ? <VeDichPickBoard cells={board} pickedIds={myPicks ?? []} values={RIENG_PICK_VALUES} />
                    : <VeDichPickBoard cells={board} pickedIds={myPicks ?? []} />}
            </QuestionCard>
        </PlayerStage>
    )
}

function VeDichPlayRieng({ ctx }: { ctx: VeDichRiengPlayerCtx }) {
    const { v, remaining, myId, flash, answerBusy, submitAnswer, cmdBusy, command, audience } = ctx
    const submissions: SubmissionEntry[] = []
    if (v.me.mySubmission) {
        submissions.push({ kind: "answer", answer: v.me.mySubmission.answer, elapsedS: v.me.mySubmission.elapsedS })
    }
    const openQ = ctx.open[0] ?? null
    const qid = openQ?.questionId ?? null
    const timerRemaining = timerRemainingOf(openQ, remaining)
    let faceSlot: ReactNode = undefined
    if (audience) {
        faceSlot = <AudienceFace options={openQ?.question?.payload.options ?? []} />
    }
    let actionSlot: ReactNode = null
    if (openQ) {
        if (v.me.canBuzz) {
            const questionId = openQ.questionId
            actionSlot = (
                <button
                    type="button"
                    onClick={() => command({ type: "buzz", questionId })}
                    disabled={cmdBusy}
                    className={`flex h-[3.3cqw] items-center gap-[0.8cqw] rounded-lg bg-destructive px-[2cqw] font-sans text-base font-bold uppercase text-destructive-foreground shadow-sm transition hover:brightness-110 disabled:opacity-60${cmdBusy ? "" : " control-breathe"}`}
                    style={{ borderRadius: STRIP_R }}
                    title={COPY.buzz}
                >
                    <Hand className="size-4" aria-hidden /> {COPY.buzz}
                </button>
            )
        } else {
            if (v.me.canAnswer) {
                if (openQ.question) {
                    actionSlot = (
                        <AnswerBand
                            question={openQ.question}
                            answered={v.me.answerState === "answered"}
                            disabled={remaining <= 0}
                            busy={answerBusy}
                            error={flash}
                            onSubmit={(value) => submitAnswer(qid, value)}
                        />
                    )
                }
            }
        }
    }
    return (
        <PlayerStage
            rail={<Rail view={v} myId={myId} currentQid={qid || null} />}
        >
            <QuestionCard
                round="Về đích"
                mode="Lượt cá nhân"
                right={
                    <span className="flex items-center gap-[1.2cqw]">
                        <QuestionChips chips={playerTurnChips(v)} />
                        <Timer remaining={timerRemaining} />
                    </span>
                }
                question={openQ?.question?.questionText ?? null}
                media={openQ?.question?.media ?? null}
                face={faceSlot}
            />
            <>{actionSlot}</>
            <SubmissionLog entries={submissions} />
        </PlayerStage>
    )
}

function VeDichPlayChung({ ctx }: { ctx: VeDichChungPlayerCtx }) {
    const { v, remaining, myId, flash, answerBusy, submitAnswer } = ctx
    const submissions: SubmissionEntry[] = []
    if (v.me.mySubmission) {
        submissions.push({ kind: "answer", answer: v.me.mySubmission.answer, elapsedS: v.me.mySubmission.elapsedS })
    }
    const openQ = ctx.open[0] ?? null
    const qid = openQ?.questionId ?? null
    const timerRemaining = timerRemainingOf(openQ, remaining)
    return (
        <PlayerStage
            rail={<Rail view={v} myId={myId} currentQid={qid || null} />}
        >
            <QuestionCard
                round="Về đích"
                mode="Lượt chung"
                right={
                    <span className="flex items-center gap-[1.2cqw]">
                        <QuestionChips chips={playerTurnChips(v)} />
                        <Timer remaining={timerRemaining} />
                    </span>
                }
                question={openQ?.question?.questionText ?? null}
                media={openQ?.question?.media ?? null}
            />
            <>
                {openQ?.question && (
                    <AnswerBand
                        question={openQ.question}
                        answered={v.me.answerState === "answered"}
                        disabled={remaining <= 0}
                        busy={answerBusy}
                        error={flash}
                        typedOnly
                        onSubmit={(value) => submitAnswer(openQ.questionId, value)}
                    />
                )}
            </>
            <SubmissionLog entries={submissions} />
        </PlayerStage>
    )
}
