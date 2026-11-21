import { Hand } from "lucide-react"
import { PlayerStage, QuestionCard, Rail, Timer } from "@shared/deck/player-deck"
import { COPY } from "@shared/deck/copy"
import { STRIP_R, pt } from "@shared/deck/geometry"
import { useCountdown } from "@shared/lib/clock"
import type { PlayerCtx } from "@shared/deck/player-deck"
import { useTieBreakMatch } from "@/lib/live"

export function TieBreakAOCPlayer({ ctx }: { ctx: PlayerCtx }) {
    const { v, myId, clock } = ctx
    const tie = useTieBreakMatch(v.matchId, true)
    const view = tie.view
    const deadline = view?.deadlineAt ?? null
    const remaining = useCountdown(deadline, clock)

    let eliminated = false
    if (view) {
        if (view.me) eliminated = view.me.eliminated
    }

    const qid = view?.questionId ?? null

    let canBuzz = false
    if (view) {
        if (view.windowOpen) {
            if (!eliminated) {
                if (!view.ended) canBuzz = true
            }
        }
    }
    let buzzClick: (() => void) | undefined = undefined
    if (canBuzz) {
        if (qid) {
            if (!tie.buzz.isPending) {
                const questionId = qid
                buzzClick = () => tie.buzz.mutate(questionId)
            }
        }
    }

    let timerRemaining: number | null = null
    if (view) {
        if (view.deadlineAt) timerRemaining = remaining
    }

    let statusLine = null
    if (eliminated) {
        statusLine = (
            <span className="font-sans font-semibold text-destructive" style={{ fontSize: pt(12) }}>
                Bạn đã bị loại — theo dõi câu tiếp theo
            </span>
        )
    }

    return (
        <PlayerStage
            rail={<Rail view={v} myId={myId} currentQid={qid} />}
        >
            <QuestionCard
                round="Câu hỏi phụ"
                right={<Timer remaining={timerRemaining} />}
                question={view?.question?.questionText ?? null}
                media={view?.question?.media ?? null}
            />
            {statusLine}
            {buzzClick ? (
                <button
                    type="button"
                    onClick={buzzClick}
                    disabled={tie.buzz.isPending}
                    className="flex h-[3.3cqw] items-center gap-[0.8cqw] rounded-lg bg-destructive px-[2cqw] font-sans text-base font-bold uppercase text-destructive-foreground shadow-sm transition hover:brightness-110 disabled:opacity-60"
                    style={{ borderRadius: STRIP_R }}
                    title={COPY.buzz}
                >
                    <Hand className="size-4" aria-hidden /> {COPY.buzz}
                </button>
            ) : null}
        </PlayerStage>
    )
}
