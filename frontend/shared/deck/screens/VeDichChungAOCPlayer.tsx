import { formatRemaining } from "@shared/lib/clock"
import { AnswerBand, PlayerStage, QuestionFrame, Rail, Timer, VeDichStripCells, type PlayerCore } from "../player-deck"
import type { AnswerValue } from "../types"
import { stripCellsOf } from "../ve-dich-board"

// Về đích — câu hỏi mở, phase 1 (S7): the shared round — the typed form for the
// answerer, the public power declaration for everyone. Pure: every value comes
// from the orchestrator, narrowed here.
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
            band={
                <>
                    {/* powers first: declaring is public and one-shot */}
                    {/* Chung has NO powers: both STAR and ASSIGN are Riêng rules. */}
                    <AnswerBand
                        question={openQ.question}
                        answerState={v.me.answerState}
                        verdict={v.me.verdicts?.[qid]}
                        busy={answerBusy}
                        error={flash}
                        onSubmit={(value) => submitAnswer(qid, value)}
                    />
                </>
            }
            hint={v.me.canAnswer && remaining !== null ? `còn ${formatRemaining(remaining)}` : undefined}
            flash={flash}
        >
            <QuestionFrame
                round="Về đích"
                mode="Lượt chung"
                mid={<VeDichStripCells cells={stripCellsOf(v.board)} phase2={false} />}
                right={<Timer remaining={openQ ? remaining : null} fallback="—" />}
                question={openQ.question?.questionText ?? null}
                media={openQ.question?.media ?? null}
                answer={v.revealed?.answer}
            />
        </PlayerStage>
    )
}
