import { AnswerBand, PlayerStage, QuestionCard, Rail, Timer, VeDichStripCells, type PlayerCore , SubmissionLog, type SubmissionEntry } from "../player-deck"
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
                        <VeDichStripCells cells={stripCellsOf(v.board)} />
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
                        onSubmit={(value) => submitAnswer(openQ.questionId, value)}
                    />
                )}
            </>
            <SubmissionLog entries={submissions} />
        </PlayerStage>
    )
}
