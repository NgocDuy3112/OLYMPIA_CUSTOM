import { Shield, Zap } from "lucide-react"
import { formatRemaining } from "@shared/lib/clock"
import { Band, Badges, CardHeader, MainCard, QuestionBlock, Rail, StageLayout, Status, Timer, AnswerBand, VeDichStripCells, type PlayerCtx } from "@shared/deck/player-deck"
import { STRIP_R } from "@shared/deck/geometry"

// Về đích — câu hỏi mở, phase 1 (S7): the shared round — the typed form for
// the answerer, the public power declaration for everyone. Pure: every value
// comes from the orchestrator's PlayerCtx.
export function VeDichChungOC4Player({ ctx }: { ctx: PlayerCtx }) {
    const { v, remaining, myId, flash, answerBusy, submitAnswer, cmdBusy, command } = ctx
    const openQ = ctx.open[0]
    const qid = openQ.questionId
    const stripCells = (v.board ?? []).filter((cell) => cell.where !== "free")
    return (
        <StageLayout rail={<Rail variant="answers" view={v} myId={myId} currentQid={qid || null} />}>
            <MainCard>
                <CardHeader
                    left={<Badges round="Về đích" mode="Lượt chung" />}
                    mid={<VeDichStripCells cells={stripCells} phase2={false} />}
                    right={<Timer remaining={openQ ? remaining : null} fallback="—" />}
                />
                <QuestionBlock question={openQ.question?.questionText ?? null} media={openQ.question?.media ?? null} />
            </MainCard>
            <Band>
                {/* powers first: declaring is public and one-shot */}
                {v.me.canDeclarePower && (
                    <>
                        <button
                            type="button"
                            onClick={() => command({ type: "power", power: "HOPE" })}
                            disabled={cmdBusy}
                            className="flex h-[3.3cqw] items-center gap-[0.5cqw] rounded-lg border border-amber-300 bg-amber-50 px-[1.2cqw] font-sans text-sm font-semibold text-amber-700 transition hover:bg-amber-100 disabled:opacity-50"
                            style={{ borderRadius: STRIP_R }}
                        >
                            <Zap className="size-3.5" aria-hidden /> Hy vọng
                        </button>
                        <button
                            type="button"
                            onClick={() => command({ type: "power", power: "SHIELD" })}
                            disabled={cmdBusy}
                            className="flex h-[3.3cqw] items-center gap-[0.5cqw] rounded-lg border border-emerald-300 bg-emerald-50 px-[1.2cqw] font-sans text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50"
                            style={{ borderRadius: STRIP_R }}
                        >
                            <Shield className="size-3.5" aria-hidden /> Khiên
                        </button>
                    </>
                )}
                <AnswerBand
                    question={openQ.question}
                    answerState={v.me.answerState}
                    verdict={v.me.verdicts?.[qid]}
                    busy={answerBusy}
                    error={flash}
                    onSubmit={(value) => submitAnswer(qid, value)}
                />
            </Band>
            <Status
                error={flash}
                hint={
                    v.me.canAnswer && remaining !== null
                        ? `còn ${formatRemaining(remaining)}`
                        : undefined
                }
            />
        </StageLayout>
    )
}
