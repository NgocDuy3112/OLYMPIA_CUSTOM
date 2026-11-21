import { AnswerBand, PlayerStage, QuestionCard, Rail, Timer, VeDichStripCells, type PlayerCore } from "../player-deck"
import type { AnswerValue } from "../types"
import { stripCellsOf } from "../ve-dich-board"
import { timerRemainingOf } from "@shared/lib/clock"

type VeDichChungPlayerCtx = PlayerCore & {
    remaining: number
    answerBusy: boolean
    submitAnswer: (questionId: string, value: AnswerValue) => void
}

export function VeDichChungAOCPlayer({ ctx }: { ctx: VeDichChungPlayerCtx }) {
    const { v, remaining, myId, flash, answerBusy, submitAnswer } = ctx
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
                mid={<VeDichStripCells cells={stripCellsOf(v.board)} />}
                right={<Timer remaining={timerRemaining} />}
                question={openQ?.question?.questionText ?? null}
                media={openQ?.question?.media ?? null}
            />
            <>
                {openQ?.question && (
                    <AnswerBand
                        question={openQ.question}
                        answerState={v.me.answerState}
                        disabled={remaining <= 0}
                        busy={answerBusy}
                        error={flash}
                        onSubmit={(value) => submitAnswer(openQ.questionId, value)}
                    />
                )}
            </>
        </PlayerStage>
    )
}
