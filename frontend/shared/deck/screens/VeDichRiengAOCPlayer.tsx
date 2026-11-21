import type { ReactNode } from "react"
import { Hand } from "lucide-react"
import { AnswerBand, AudienceFace, PlayerStage, QuestionCard, Rail, Timer, VeDichStripCells, type PlayerCore } from "../player-deck"
import { STRIP_R } from "../geometry"
import { stripCellsOf } from "../ve-dich-board"
import { timerRemainingOf } from "@shared/lib/clock"
import { COPY } from "../copy"
import type { AnswerValue, VeDichCommand } from "../types"

type VeDichRiengPlayerCtx = PlayerCore & {
    remaining: number
    answerBusy: boolean
    submitAnswer: (questionId: string, value: AnswerValue) => void
    cmdBusy: boolean
    command: (action: VeDichCommand) => void
}

export function VeDichRiengAOCPlayer({ ctx }: { ctx: VeDichRiengPlayerCtx }) {
    const { v, remaining, myId, flash, answerBusy, submitAnswer, cmdBusy, command, audience } = ctx
    const openQ = ctx.open[0]
    const qid = openQ.questionId
    const timerRemaining = timerRemainingOf(openQ, remaining)
    let faceSlot: ReactNode = undefined
    if (audience) {
        faceSlot = <AudienceFace options={openQ.question?.payload.options ?? []} />
    }
    let actionSlot: ReactNode = null
    if (openQ) {
        if (v.me.canBuzz) {
            actionSlot = (
                <button
                    type="button"
                    onClick={() => command({ type: "buzz", questionId: openQ.questionId })}
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
                            answerState={v.me.answerState}
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
                mid={<VeDichStripCells cells={stripCellsOf(v.board)} />}
                right={<Timer remaining={timerRemaining} />}
                question={openQ.question?.questionText ?? null}
                media={openQ.question?.media ?? null}
                face={faceSlot}
            />
            <>{actionSlot}</>
        </PlayerStage>
    )
}
