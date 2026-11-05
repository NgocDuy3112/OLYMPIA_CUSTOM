import { ConsoleStage, QuestionFrame, Rail, Timer, VeDichStripCells } from "@/components/stage/deck"
import { backToLobbyAction, verdictActions } from "@/components/stage/actions"
import { COPY } from "@shared/deck/copy"
import { formatBuzzMs } from "@shared/lib/clock"

// Về đích — câu hỏi mở, phase 2 (S8, locked): the personal round — oral answer,
// the 5-second buzz window, and a verdict for both answerer and buzzer. Pure:
// everything comes from its ctx.
import type { VeDichConsole } from "@/lib/live"
import type { ScreenCore } from "../types"

/** Về đích · phase 2 question: oral + buzz + powers + the judging strip. */
export type VeDichRiengCtx = ScreenCore & {
    remaining: number | null
    consoleVeDich: VeDichConsole | null
    target: string | null
    setVerdict: (correct: boolean) => void
    setSelectedPlayer: (userId: string) => void
    verdictOf: (questionId: string, userId: string) => "CORRECT" | "INCORRECT" | null
    hetLuot: () => void
}

export function VeDichRiengAOCController({ ctx }: { ctx: VeDichRiengCtx }) {
    const { v, remaining, baseCards, consoleVeDich, flash, openRounds } = ctx
    const projection = v.projection

    const stripCells = (projection.board ?? []).filter((c) => c.where === "open" || c.where === "pending")
    const openNow = projection.open[0]
    const qid = openNow.questionId
    // Both roles must be judged before the turn can close: the oral answerer
    // (always) and the buzzer (only when someone buzzed).
    const needsVerdict =
        consoleVeDich?.answererId ? ctx.verdictOf(qid, consoleVeDich.answererId) === null : true
    const buzzerMissing =
        consoleVeDich?.buzzerId ? ctx.verdictOf(qid, consoleVeDich.buzzerId) === null : false
    const turnOpen = needsVerdict || buzzerMissing

    // A duel runs on the QUESTION's clock, so there is no answer to close: the
    // engine would refuse it. Keep the slot inert while the pair races. (The
    // power ITSELF was decided earlier — on the pick board, before the open.)
    const racing = consoleVeDich?.power === "ASSIGN"
    // …but a race needs an exit: the operator stops the clock and locks BOTH
    // halves out. Then the question resolves as the nobody-buzzed case.
    const canLockBuzz = consoleVeDich?.openStage === "buzz" && consoleVeDich.buzzerId === null

    return (
        <ConsoleStage
            rail={<Rail variant="compact" cards={baseCards} onSelect={ctx.setSelectedPlayer} />}
            actions={[
                {
                    label: "Mở chuông",
                    onClick: consoleVeDich?.openStage === "current" && !racing
                        ? () => ctx.send({ kind: "ve-dich.closeCurrentAnswer" })
                        : undefined,
                },
                {
                    label: "Khoá chuông",
                    onClick: canLockBuzz ? () => ctx.send({ kind: "ve-dich.lockBuzz" }) : undefined,
                },
                {
                    // The stopwatch: the winning buzz's reaction time.
                    label: "Chuông",
                    content: formatBuzzMs(consoleVeDich?.buzzerMs ?? null),
                    muted: true
                },
                ...verdictActions({ canVerdict: ctx.target !== null, onVerdict: ctx.setVerdict }),
                { label: COPY.endTurn, onClick: turnOpen ? undefined : () => ctx.hetLuot() },
                backToLobbyAction(ctx.backToLobby),
            ]}
            flash={flash}
        >
            <QuestionFrame
                round="Về đích"
                mode="Lượt cá nhân"
                onRoundClick={openRounds}
                mid={<VeDichStripCells cells={stripCells} phase2 />}
                right={<Timer remaining={remaining} />}
                question={openNow.question?.questionText ?? ""}
                media={openNow.question?.media ?? null}
            />
        </ConsoleStage>
    )
}
