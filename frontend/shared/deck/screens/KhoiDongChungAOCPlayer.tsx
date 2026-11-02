import { PlayerStage, Progress, QuestionFrame, Rail, Timer, type PlayerCore } from "../player-deck"
import { STRIP_R, pt } from "../geometry"
import { COPY } from "../copy"
import { formatBuzzMs } from "@shared/lib/clock"
import type { PlayerView } from "../types"

// Khởi động — lượt chung (S2): NOW a buzz race. Twelve questions, one at a
// time; the MC opens a 5 s window and the fastest buzz answers out loud.
//
//   attempt 1, correct → +10        | wrong → this player is locked out
//   attempt 2, correct → +5         | wrong → the question dies
//
// Pure: every value comes from the orchestrator, narrowed to what this screen reads.
export type KhoiDongChungPlayerCtx = PlayerCore & {
    remaining: number
    /** the question in play (one at a time now, not a batch) */
    s2Q: PlayerView["open"][number] | undefined
    answerBusy: boolean
    buzzBusy: boolean
    buzz: () => void
}

/** What the band says when this player cannot or need not press anything. */
function standDown(v: PlayerView, questionInPlay: boolean): string {
    if (!questionInPlay) return "Chờ MC mở câu tiếp theo…"
    if (v.me.lockedOut) return "Bạn đã trả lời sai — câu này không được bấm chuông nữa"
    if (v.me.isAnswerer) return `Bạn nhanh nhất (${formatBuzzMs(v.me.buzzerMs)}) — trả lời đi!`
    return "Chờ chuông…"
}

export function KhoiDongChungAOCPlayer({ ctx }: { ctx: KhoiDongChungPlayerCtx }) {
    const { v, remaining, myId, flash, s2Q, answerBusy, buzzBusy, buzz } = ctx
    const inPlay = s2Q !== undefined

    return (
        <PlayerStage
            rail={<Rail variant="answers" view={v} myId={myId} currentQid={s2Q?.questionId ?? null} />}
            band={
                v.me.canBuzz ? (
                    <button
                        type="button"
                        onClick={buzz}
                        disabled={buzzBusy || answerBusy}
                        className="flex h-[3.3cqw] items-center gap-[0.8cqw] rounded-lg bg-destructive px-[2.4cqw] font-sans text-base font-bold uppercase text-destructive-foreground shadow-sm transition hover:brightness-110 disabled:opacity-60"
                        style={{ borderRadius: STRIP_R }}
                        title={COPY.buzz}
                    >
                        <span className="size-[1.1cqw] rounded-full bg-destructive-foreground" aria-hidden />
                        {COPY.buzz}
                    </button>
                ) : (
                    <span
                        className="flex h-[3.3cqw] items-center rounded-lg bg-muted px-[1.2cqw] font-sans font-semibold text-foreground ring-1 ring-border"
                        style={{ fontSize: pt(12), borderRadius: STRIP_R }}
                    >
                        {standDown(v, inPlay)}
                    </span>
                )
            }
            hint={
                inPlay
                    ? `còn ${formatSeconds(remaining)} · ${v.me.attempt === 2 ? "lượt 2 (×5)" : "lượt 1 (×10)"}` +
                      (v.me.buzzer ? ` · chuông ${formatBuzzMs(v.me.buzzerMs)}` : "")
                    : "chờ MC"
            }
            flash={flash}
        >
            <QuestionFrame
                round="Khởi động"
                mode="Lượt chung"
                right={
                    <>
                        <Progress total={12} done={0} active={0} />
                        <Timer remaining={remaining} fallback="5s" />
                    </>
                }
                question={s2Q?.question?.questionText ?? null}
                media={s2Q?.question?.media ?? null}
            />
        </PlayerStage>
    )
}

/** Two digits, like every other clock on the deck. */
function formatSeconds(remaining: number): string {
    return `${Math.max(0, Math.ceil(remaining))}s`
}
