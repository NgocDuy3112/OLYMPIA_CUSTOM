import { Shield, Zap } from "lucide-react"
import { formatRemaining } from "@shared/lib/clock"
import { Band, Badges, MainCard, QuestionBlock, Rail, Status, Timer, AnswerBand, Box, type PlayerCtx } from "@shared/deck/player-deck"
import { DECK_PAD, STRIP_R, pt } from "@shared/deck/geometry"

// Về đích — câu hỏi mở, phase 1 (S7): the shared round — the typed form for
// the answerer, the public power declaration for everyone. Pure: every value
// comes from the orchestrator's PlayerCtx.
export function VeDichChungPlayer({ ctx }: { ctx: PlayerCtx }) {
    const { v, remaining, myId, flash, answerBusy, submitAnswer, cmdBusy, command } = ctx
    const openQ = ctx.open[0]
    const qid = openQ.questionId
    const stripCells = (v.board ?? []).filter((cell) => cell.where !== "free").slice(0, 4)
    const stripX = [2.7, 4.2, 5.66, 7.14]
    return (
        <>
            <MainCard>
                <Badges round="Về đích" mode="Lượt chung" />
                {stripCells.map((cell, i) => (
                    <Box key={cell.questionId} x={stripX[i]} y={0.65} w={1.33} h={0.59}
                        className={`flex flex-col items-center justify-center rounded-lg shadow-sm ring-1 ${cell.where === "open" ? "bg-primary text-primary-foreground ring-primary" : "bg-muted ring-border"}`}
                        style={DECK_PAD}
                    >
                        <span className="truncate px-1 text-center font-display leading-tight" style={{ fontSize: pt(12) }}>{cell.domain}</span>
                        <b className="font-display leading-none" style={{ fontSize: pt(20) }}>{cell.value}</b>
                    </Box>
                ))}
                <Timer remaining={openQ ? remaining : null} fallback="—" />
                <QuestionBlock question={openQ.question ?? null} />
            </MainCard>
            <Rail variant="answers" view={v} myId={myId} currentQid={qid || null} />
            <Band layout="ve-dich-chung">
                {/* powers first: declaring is public and one-shot */}
                {v.me.canDeclarePower && (
                    <>
                        <button
                            type="button"
                            onClick={() => command({ type: "power", power: "HOPE" })}
                            disabled={cmdBusy}
                            className="flex h-full min-h-[1.9em] items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-3 font-sans text-sm font-semibold text-amber-700 transition hover:bg-amber-100 disabled:opacity-50"
                            style={{ borderRadius: STRIP_R }}
                        >
                            <Zap className="size-3.5" aria-hidden /> Hy vọng
                        </button>
                        <button
                            type="button"
                            onClick={() => command({ type: "power", power: "SHIELD" })}
                            disabled={cmdBusy}
                            className="flex h-full min-h-[1.9em] items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-3 font-sans text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50"
                            style={{ borderRadius: STRIP_R }}
                        >
                            <Shield className="size-3.5" aria-hidden /> Khiên
                        </button>
                    </>
                )}
                <AnswerBand
                    layout="ve-dich-chung"
                    question={openQ.question}
                    answerState={v.me.answerState}
                    verdict={v.me.verdicts?.[qid]}
                    busy={answerBusy}
                    error={flash}
                    onSubmit={(value) => submitAnswer(qid, value)}
                />
            </Band>
            <Status
                y={5.22}
                error={flash}
                hint={
                    v.me.canAnswer && remaining !== null
                        ? `còn ${formatRemaining(remaining)}`
                        : undefined
                }
            />
        </>
    )
}
