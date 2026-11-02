import { formatRemaining } from "@shared/lib/clock"
import { AnswerBand, PlayerStage, PowerButtons, QuestionFrame, Rail, Timer, VeDichStripCells, type PlayerCore } from "@shared/deck/player-deck"
import type { AnswerValue, VeDichCommand } from "@shared/deck/types"
import { stripCellsOf } from "@shared/deck/ve-dich-board"

// Về đích — câu hỏi mở, phase 1 (S7): the shared round — the typed form for the
// answerer, the public power declaration for everyone. Pure: every value comes
// from the orchestrator, narrowed here.
export type VeDichChungPlayerCtx = PlayerCore & {
    remaining: number
    answerBusy: boolean
    submitAnswer: (questionId: string, value: AnswerValue) => void
    cmdBusy: boolean
    command: (action: VeDichCommand) => void
}

export function VeDichChungAOCPlayer({ ctx }: { ctx: VeDichChungPlayerCtx }) {
    const { v, remaining, myId, flash, answerBusy, submitAnswer, cmdBusy, command } = ctx
    const openQ = ctx.open[0]
    const qid = openQ.questionId
    return (
        <PlayerStage
            rail={<Rail variant="answers" view={v} myId={myId} currentQid={qid || null} />}
            band={
                <>
                    {/* powers first: declaring is public and one-shot */}
                    {v.me.canDeclarePower && <PowerButtons busy={cmdBusy} onDeclare={command} />}
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
            />
        </PlayerStage>
    )
}
