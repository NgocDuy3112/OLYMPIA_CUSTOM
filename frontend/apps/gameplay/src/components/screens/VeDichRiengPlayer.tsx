import { Hand, Shield, Zap } from "lucide-react"
import { formatRemaining } from "@shared/lib/clock"
import { Band, Badges, CardHeader, MainCard, QuestionBlock, Rail, StageLayout, Status, Timer, AnswerBand, VeDichStripCells, type PlayerCtx } from "@shared/deck/player-deck"
import { STRIP_R, pt } from "@shared/deck/geometry"

// Về đích — câu hỏi mở, phase 2 (S8): the personal round — everyone sees the
// question; the answer is oral, the buzz window is the typed part, and powers
// are declared here. Pure: every value comes from the orchestrator's PlayerCtx.
export function VeDichRiengPlayer({ ctx }: { ctx: PlayerCtx }) {
    const { v, remaining, myId, flash, answerBusy, submitAnswer, cmdBusy, command } = ctx
    const openQ = ctx.open[0]
    const qid = openQ.questionId
    const stripCells = (v.board ?? []).filter((cell) => cell.where !== "free")
    return (
        <StageLayout rail={<Rail variant="compact" view={v} myId={myId} currentQid={qid || null} />}>
            <MainCard>
                <CardHeader
                    left={<Badges round="Về đích" mode="Lượt cá nhân" />}
                    mid={<VeDichStripCells cells={stripCells} phase2 />}
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
                {v.me.canBuzz && openQ ? (
                    <button
                        type="button"
                        onClick={() => command({ type: "buzz", questionId: openQ.questionId })}
                        disabled={cmdBusy}
                        className="flex h-[3.3cqw] items-center gap-[0.8cqw] rounded-lg bg-destructive px-[2cqw] font-sans text-base font-bold uppercase text-destructive-foreground shadow-sm transition hover:brightness-110 disabled:opacity-60"
                        style={{ borderRadius: STRIP_R }}
                        title="Bấm chuông"
                    >
                        <Hand className="size-4" aria-hidden /> Bấm chuông
                    </button>
                ) : v.me.canAnswer && openQ ? (
                    <AnswerBand
                        question={openQ.question}
                        answerState={v.me.answerState}
                        verdict={v.me.verdicts?.[qid]}
                        busy={answerBusy}
                        error={flash}
                        onSubmit={(value) => submitAnswer(qid, value)}
                    />
                ) : (
                    <span className="flex h-[3.3cqw] items-center rounded-lg bg-muted px-[1.2cqw] font-sans font-semibold text-foreground ring-1 ring-border" style={{ fontSize: pt(12), borderRadius: STRIP_R }}>
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
                error={flash}
                hint={
                    remaining !== null
                        ? `còn ${formatRemaining(remaining)}`
                        : undefined
                }
            />
        </StageLayout>
    )
}
