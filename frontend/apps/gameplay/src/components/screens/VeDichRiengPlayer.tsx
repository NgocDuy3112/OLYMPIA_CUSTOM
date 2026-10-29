import { Hand, Shield, Zap } from "lucide-react"
import { formatRemaining } from "@shared/lib/clock"
import { Band, Badges, MainCard, QuestionBlock, Rail, Status, Timer, AnswerBand, Box, type PlayerCtx } from "@shared/deck/player-deck"
import { DECK_PAD, STRIP_R, pt } from "@shared/deck/geometry"

// Về đích — câu hỏi mở, phase 2 (S8): the personal round — everyone sees the
// question; the answer is oral, the buzz window is the typed part, and powers
// are declared here. Pure: every value comes from the orchestrator's PlayerCtx.
export function VeDichRiengPlayer({ ctx }: { ctx: PlayerCtx }) {
    const { v, remaining, myId, flash, answerBusy, submitAnswer, cmdBusy, command } = ctx
    const openQ = ctx.open[0]
    const qid = openQ.questionId
    const stripCells = (v.board ?? []).filter((cell) => cell.where !== "free").slice(0, 3)
    const stripX = [4.2, 5.66, 7.14]
    return (
        <>
            <MainCard>
                <Badges round="Về đích" mode="Lượt cá nhân" />
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
            <Rail variant="compact" view={v} myId={myId} currentQid={qid || null} />
            <Band layout="ve-dich-rieng">
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
                {v.me.canBuzz && openQ ? (
                    <button
                        type="button"
                        onClick={() => command({ type: "buzz", questionId: openQ.questionId })}
                        disabled={cmdBusy}
                        className="flex h-full min-h-[1.9em] items-center gap-2 rounded-lg bg-destructive px-5 font-sans text-base font-bold uppercase text-destructive-foreground shadow-sm transition hover:brightness-110 disabled:opacity-60"
                        style={{ borderRadius: STRIP_R }}
                        title="Bấm chuông"
                    >
                        <Hand className="size-4" aria-hidden /> Bấm chuông
                    </button>
                ) : v.me.canAnswer && openQ ? (
                    <AnswerBand
                        layout="ve-dich-rieng"
                        question={openQ.question}
                        answerState={v.me.answerState}
                        verdict={v.me.verdicts?.[qid]}
                        busy={answerBusy}
                        error={flash}
                        onSubmit={(value) => submitAnswer(qid, value)}
                    />
                ) : (
                    <span className="flex h-full items-center rounded-lg bg-muted px-3 font-sans font-semibold text-foreground ring-1 ring-border" style={{ fontSize: pt(12), borderRadius: STRIP_R }}>
                        {v.me.isAnswerer
                            ? "Bạn trả lời miệng trước MC"
                            : v.me.buzzer
                                ? `Đập chuông trước: ${ctx.nameOf(v.me.buzzer)}`
                                : v.me.power
                                    ? `${v.me.power === "HOPE" ? "Bùa hy vọng" : "Bùa bảo hộ"} đã công bố`
                                    : "Theo dõi thí sinh trả lời"}
                    </span>
                )}
            </Band>
            <Status
                y={5.22}
                error={flash}
                hint={
                    remaining !== null
                        ? `còn ${formatRemaining(remaining)}`
                        : undefined
                }
            />
        </>
    )
}
