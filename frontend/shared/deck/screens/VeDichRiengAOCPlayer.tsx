import { Hand } from "lucide-react"
import { AnswerBand, AudienceFace, PlayerStage, QuestionCard, Rail, Timer, VeDichStripCells, type PlayerCore } from "../player-deck"
import { STRIP_R, pt } from "../geometry"
import { stripCellsOf } from "../ve-dich-board"
import { formatBuzzMs } from "@shared/lib/clock"
import { COPY } from "../copy"
import type { AnswerValue, VeDichCommand } from "../types"

type VeDichRiengPlayerCtx = PlayerCore & {
    remaining: number
    answerBusy: boolean
    submitAnswer: (questionId: string, value: AnswerValue) => void
    cmdBusy: boolean
    command: (action: VeDichCommand) => void
}

function spectatorLine(ctx: VeDichRiengPlayerCtx): string {
    const me = ctx.v.me
    if (me.isAnswerer) return "Bạn trả lời miệng trước ban điều hành"
    if (me.buzzer === ctx.myId && me.buzzerMs !== null && me.buzzerMs !== undefined) {
        return `Bạn bấm chuông nhanh nhất (${formatBuzzMs(me.buzzerMs)}) — trả lời đi!`
    }
    if (me.buzzer) return `Đập chuông trước: ${ctx.nameOf(me.buzzer)}`
    if (me.power === "STAR") return "Ngôi sao đã công bố"
    if (me.power === "ASSIGN") return "Đã chỉ định người trả lời"
    return "Theo dõi thí sinh trả lời"
}

export function VeDichRiengAOCPlayer({ ctx }: { ctx: VeDichRiengPlayerCtx }) {
    const { v, remaining, myId, flash, answerBusy, submitAnswer, cmdBusy, command, audience } = ctx
    const openQ = ctx.open[0]
    const qid = openQ.questionId
    return (
        <PlayerStage
            rail={<Rail variant="compact" view={v} myId={myId} currentQid={qid || null} />}
        >
            <QuestionCard
                round="Về đích"
                mode="Lượt cá nhân"
                mid={<VeDichStripCells cells={stripCellsOf(v.board)} phase2 />}
                right={<Timer remaining={openQ?.deadlineAt ? remaining : null} />}
                question={openQ.question?.questionText ?? null}
                media={openQ.question?.media ?? null}
                face={
                    audience ? (
                        <AudienceFace options={openQ.question?.payload.options ?? []} />
                    ) : undefined
                }
                footer={
                <>
                    {v.me.canBuzz && openQ ? (
                        <button
                            type="button"
                            onClick={() => command({ type: "buzz", questionId: openQ.questionId })}
                            disabled={cmdBusy}
                            className="flex h-[3.3cqw] items-center gap-[0.8cqw] rounded-lg bg-destructive px-[2cqw] font-sans text-base font-bold uppercase text-destructive-foreground shadow-sm transition hover:brightness-110 disabled:opacity-60"
                            style={{ borderRadius: STRIP_R }}
                            title={COPY.buzz}
                        >
                            <Hand className="size-4" aria-hidden /> {COPY.buzz}
                        </button>
                    ) : v.me.canAnswer && openQ?.question ? (
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
                            {spectatorLine(ctx)}
                        </span>
                    )}
                </>
            
                }
            />
        </PlayerStage>
    )
}
