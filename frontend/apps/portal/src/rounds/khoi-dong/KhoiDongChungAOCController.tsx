import { ConsoleStage, Progress, QuestionFrame, Rail, Timer } from "@/components/stage/deck"
import { backToLobbyAction } from "@/components/stage/actions"
import { COPY } from "@shared/deck/copy"
import { formatBuzzMs } from "@shared/lib/clock"

// Khởi động — lượt chung (S2): the BUZZ race, twelve questions, one at a time.
//
//   Mở chuông   opens the 5 s window (the first attempt, or the re-buzz)
//   Đúng / Sai  judges the FASTEST buzzer: +10 on attempt 1, +5 on attempt 2
//   Câu tiếp    moves on — nobody buzzed, or the question is done
//
// Pure: every value comes from its narrow ctx.
import type { KhoiDongConsole } from "@/lib/live"
import type { ScreenCore } from "../types"

/** Khởi động · lượt chung: the buzz race. */
export type KhoiDongChungCtx = ScreenCore & {
    remaining: number | null
    consoleKhoiDong: KhoiDongConsole | null
}

export function KhoiDongChungAOCController({ ctx }: { ctx: KhoiDongChungCtx }) {
    const { v, remaining, baseCards, flash, openRounds, consoleKhoiDong } = ctx
    const open = v.projection.open
    const openNow = open[0]
    const buzzer = consoleKhoiDong?.buzzerId ?? null
    const attempt = consoleKhoiDong?.attempt ?? null

    const judge = (correct: boolean) => ctx.send({ kind: "khoi-dong.judgeBuzz", correct })

    return (
        <ConsoleStage
            rail={<Rail variant="answers" cards={baseCards} />}
            actions={[
                {
                    label: "Mở chuông",
                    // A window is open (or a buzz landed) → nothing to open.
                    onClick: consoleKhoiDong && consoleKhoiDong.windowOpen === false && buzzer === null
                        ? () => ctx.send({ kind: "khoi-dong.openBuzz" })
                        : undefined,
                },
                {
                    label: COPY.correct,
                    content: attempt === 2 ? `${COPY.correct} ×5` : `${COPY.correct} ×10`,
                    onClick: buzzer !== null ? () => judge(true) : undefined,
                },
                {
                    label: COPY.wrong,
                    onClick: buzzer !== null ? () => judge(false) : undefined,
                },
                {
                    // The race's own number: how fast the winning buzz was.
                    label: "Chuông",
                    content: formatBuzzMs(consoleKhoiDong?.buzzerMs ?? null),
                    muted: true
                },
                {
                    label: "Câu tiếp",
                    // Nobody buzzed (or the question is judged) → move on.
                    onClick: buzzer === null ? () => ctx.send({ kind: "khoi-dong.nextQuestion" }) : undefined,
                },
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
                            total={consoleKhoiDong?.questionCount || 12}
                            done={consoleKhoiDong?.questionIndex ?? 0}
                            active={consoleKhoiDong?.questionIndex ?? 0}
                        />
                        <Timer remaining={remaining} fallback="5s" />
                    </>
                }
                question={openNow?.question?.questionText ?? "Chờ mở câu tiếp theo…"}
                media={openNow?.question?.media ?? null}
            />
        </ConsoleStage>
    )
}
