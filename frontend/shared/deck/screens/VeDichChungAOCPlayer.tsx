import { AnswerBand, PlayerStage, QuestionCard, Rail, Timer, VeDichStripCells, type PlayerCore } from "../player-deck"
import type { AnswerValue } from "../types"
import { stripCellsOf } from "../ve-dich-board"

type VeDichChungPlayerCtx = PlayerCore & {
    remaining: number
    answerBusy: boolean
    submitAnswer: (questionId: string, value: AnswerValue) => void
}

export function VeDichChungAOCPlayer({ ctx }: { ctx: VeDichChungPlayerCtx }) {
    const { v, remaining, myId, flash, answerBusy, submitAnswer } = ctx
    const openQ = ctx.open[0]
    const qid = openQ.questionId
    return (
        <PlayerStage
            rail={<Rail variant="answers" view={v} myId={myId} currentQid={qid || null} />}
        >
            <QuestionCard
                round="Về đích"
                mode="Lượt chung"
                mid={<VeDichStripCells cells={stripCellsOf(v.board)} phase2={false} />}
                right={<Timer remaining={openQ.deadlineAt ? remaining : null} />}
                question={openQ.question?.questionText ?? null}
                media={openQ.question?.media ?? null}
                answer={v.revealed?.answer}
                footer={
                <>
                    {openQ.question && (
                        <AnswerBand
                            question={openQ.question}
                            answerState={v.me.answerState}
                            verdict={v.me.verdicts?.[qid]}
                            busy={answerBusy}
                            error={flash}
                            onSubmit={(value) => submitAnswer(qid, value)}
                        />
                    )}
                </>
            
                }
            />
        </PlayerStage>
    )
}
