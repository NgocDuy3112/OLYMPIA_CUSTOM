import { Hand } from "lucide-react"
import { Band, Badges, CardHeader, MainCard, Rail, StageLayout, Timer, type PlayerCtx } from "@shared/deck/player-deck"
import { STRIP_R, pt } from "@shared/deck/geometry"

// Tie-break — câu hỏi phụ, the fastest-finger decider. Structurally the
// ve-dich · Riêng screen WITHOUT the question boxes: the MC reads the question
// aloud, so nothing of it is rendered — only the clock and the bell.
//
// Flow (the view carries all of it; this screen is pure):
//   - MC presses Tính giờ → a 15 s window opens: `canBuzz` goes true for
//     everyone still in, `remaining` counts the 15 s down;
//   - the fastest player buzzes: the window locks for the rest
//     (`canBuzz` false, `buzzer` set) and the clock stops (`remaining` null).
// Buzz points rank only — they never touch the match total.
export function TieBreakAOC({ ctx }: { ctx: PlayerCtx }) {
    const { v, remaining, myId, cmdBusy, command } = ctx
    const openQ = ctx.open[0]
    const qid = openQ?.questionId ?? null
    const buzzer = v.me.buzzer
    const iBuzzed = Boolean(buzzer) && buzzer === myId

    return (
        <StageLayout rail={<Rail variant="compact" view={v} myId={myId} currentQid={qid} />}>
            <MainCard>
                <CardHeader
                    left={<Badges round="Câu hỏi phụ" mode="Bấm chuông nhanh" />}
                    right={<Timer remaining={remaining} fallback="—" />}
                />
            </MainCard>
            <Band>
                {v.me.canBuzz && qid ? (
                    <button
                        type="button"
                        onClick={() => command({ type: "buzz", questionId: qid })}
                        disabled={cmdBusy}
                        className="flex h-[3.3cqw] items-center gap-[0.8cqw] rounded-lg bg-destructive px-[2cqw] font-sans text-base font-bold uppercase text-destructive-foreground shadow-sm transition hover:brightness-110 disabled:opacity-60"
                        style={{ borderRadius: STRIP_R }}
                        title="Bấm chuông"
                    >
                        <Hand className="size-4" aria-hidden /> Bấm chuông
                    </button>
                ) : (
                    <span
                        className="flex h-[3.3cqw] items-center rounded-lg bg-muted px-[1.2cqw] font-sans font-semibold text-foreground ring-1 ring-border"
                        style={{ fontSize: pt(12), borderRadius: STRIP_R }}
                    >
                        {iBuzzed
                            ? "Bạn đã bấm chuông — chờ MC phán"
                            : buzzer
                                ? `Đập chuông trước: ${ctx.nameOf(buzzer)}`
                                : "Chờ MC bấm Tính giờ"}
                    </span>
                )}
            </Band>
        </StageLayout>
    )
}
