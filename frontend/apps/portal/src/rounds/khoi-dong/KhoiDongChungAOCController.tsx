import { ConsoleStage, Progress, QuestionFrame, Rail, Timer } from "@/components/stage/deck"
import { backToLobbyAction, verdictActions } from "@/components/stage/actions"
import type { KhoiDongConsole } from "@/lib/live"
import type { ScreenCore } from "../types"

// Khởi động — lượt chung (S2): the TIMED BATCH, six questions.
//
//   Bấm giờ     opens the 10 s window — the whole field types at once
//   Đúng / Sai  marks the SELECTED card (click a card in the rail; the default
//               target is the first player who answered)
//   the number  on the strip IS the advance: click the next one to move on —
//               never before every submitted card carries a verdict
//
// Pure: every value comes from its narrow ctx.
export type KhoiDongChungCtx = ScreenCore & {
    remaining: number | null
    consoleKhoiDong: KhoiDongConsole | null
    /** the rail's selected card — whose verdict Đúng/Sai marks */
    target: string | null
    setSelectedPlayer: (userId: string) => void
}

export function KhoiDongChungAOCController({ ctx }: { ctx: KhoiDongChungCtx }) {
    const { v, remaining, baseCards, flash, openRounds, consoleKhoiDong, target, setSelectedPlayer } = ctx
    const openNow = v.projection.open[0]
    const index = consoleKhoiDong?.questionIndex ?? 0
    const total = consoleKhoiDong?.questionCount || 6
    const windowOpen = consoleKhoiDong?.windowOpen ?? false

    const judge = (correct: boolean) => {
        if (!target) return
        ctx.send({ kind: "khoi-dong.judge", playerId: target, correct })
    }

    return (
        <ConsoleStage
            rail={<Rail variant="answers" cards={baseCards} onSelect={setSelectedPlayer} />}
            actions={[
                {
                    label: "Bấm giờ",
                    // The window runs → nothing to open; no question in play →
                    // nothing to time. The engine refuses a second press too.
                    onClick: !windowOpen && openNow
                        ? () => ctx.send({ kind: "khoi-dong.startWindow" })
                        : undefined,
                },
                ...verdictActions({ canVerdict: target !== null && openNow !== null, onVerdict: judge }),
                backToLobbyAction(ctx.backToLobby),
            ]}
            flash={flash}
        >
            <QuestionFrame
                round="Khởi động"
                mode="Lượt chung"
                onRoundClick={openRounds}
                right={
                    <>
                        <Progress
                            total={total}
                            done={index}
                            active={index}
                            // The next number is the advance button — clicking
                            // any other one does nothing (the strip is a cursor,
                            // not a jump list).
                            onPick={(i) => {
                                if (i === index + 1) ctx.send({ kind: "khoi-dong.nextQuestion" })
                            }}
                        />
                        <Timer remaining={remaining} fallback="10s" />
                    </>
                }
                question={
                    openNow?.question?.questionText ??
                    (index >= total ? "Đã hết sáu câu — Kết thúc vòng để chốt điểm" : "Chờ mở câu tiếp theo…")
                }
                media={openNow?.question?.media ?? null}
            />
        </ConsoleStage>
    )
}
