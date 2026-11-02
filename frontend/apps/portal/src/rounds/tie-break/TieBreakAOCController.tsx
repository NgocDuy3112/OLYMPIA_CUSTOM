import { Badges, CardHeader, MainCard, Rail, StageLayout, Strip, Timer } from "@/components/stage/deck"
import { backToLobbyAction } from "@/components/stage/actions"

import type { ScreenCore } from "../types"

/**
 * Tie-break — câu hỏi phụ, the fastest-finger decider. Structurally the
 * ve-dich · Rieng screen WITHOUT the question boxes: the MC reads the question
 * aloud, so only the clock and the strip remain.
 *
 * Tính giờ opens the 15 s buzz window: the countdown runs, every contestant
 * may buzz, and the fastest one locks the rest out — the clock stops and the
 * MC judges their oral answer (Đúng/Sai). Buzz points rank only.
 */
export type TieBreakCtx = ScreenCore & {
    /** the 15 s window's seconds left; null when no window is running */
    remaining: number | null
    mcTieBreak: TieBreakMc | null
    target: string | null
    setVerdict: (correct: boolean) => void
    setSelectedPlayer: (userId: string) => void
    verdictOf: (questionId: string, userId: string) => "CORRECT" | "INCORRECT" | null
    hetLuot: () => void
    /** Tính giờ — open the 15 s buzz window for the current question. */
    startWindow: () => void
}

/** The console's tie-break facts, as the view pushes them. */
export interface TieBreakMc {
    /** the window is running: buzz open for everyone still in */
    windowOpen: boolean
    /** whoever buzzed first this question — the one to judge */
    buzzerId: string | null
}

export function TieBreakAOCController({ ctx }: { ctx: TieBreakCtx }) {
    const { v, remaining, baseCards, openRounds } = ctx
    const projection = v.projection

    // The question exists server-side (the window hangs off it) — we just do
    // not draw it: the MC reads it aloud.
    const qid = projection.open[0]?.questionId ?? ""
    const windowOpen = ctx.mcTieBreak?.windowOpen ?? false
    const buzzerId = ctx.mcTieBreak?.buzzerId ?? null
    // A buzzer is waiting for the verdict; no buzzer (nobody rang in) → nothing
    // to judge, so the round may move on.
    const unjudged = buzzerId !== null && ctx.verdictOf(qid, buzzerId) === null
    const running = windowOpen && remaining !== null

    return (
        <StageLayout rail={<Rail variant="compact" cards={baseCards} onSelect={ctx.setSelectedPlayer} />}>
            <MainCard>
                <CardHeader
                    left={<Badges round="Câu hỏi phụ" mode="Bấm chuông nhanh" onRoundClick={openRounds} />}
                    right={<Timer remaining={remaining} />}
                />
            </MainCard>
            <Strip
                items={[
                    {
                        // never a countdown here — the Timer in the CardHeader
                        // IS the clock; this button only opens the window
                        label: "Tính giờ",
                        onClick: running || buzzerId ? undefined : () => ctx.startWindow(),
                    },
                    { label: "Đúng", onClick: ctx.target && buzzerId ? () => ctx.setVerdict(true) : undefined },
                    { label: "Sai", onClick: ctx.target && buzzerId ? () => ctx.setVerdict(false) : undefined },
                    { label: "Hết lượt", onClick: unjudged ? undefined : () => ctx.hetLuot() },
                    backToLobbyAction(ctx.backToLobby),
                ]}
            />
        </StageLayout>
    )
}
