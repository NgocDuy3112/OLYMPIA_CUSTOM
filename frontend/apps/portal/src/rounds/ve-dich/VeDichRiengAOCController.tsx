import { ConsoleStage, QuestionFrame, Rail, Timer, VeDichStripCells } from "@/components/stage/deck"
import { backToLobbyAction, verdictActions } from "@/components/stage/actions"
import { COPY } from "@shared/deck/copy"

// Về đích — câu hỏi mở, phase 2 (S8, locked): the personal round — oral answer,
// the 5-second buzz window, and a verdict for both answerer and buzzer. Pure:
// everything comes from its ctx.
import type { VeDichMc } from "@/lib/live"
import type { ScreenCore } from "../types"

/** Về đích · phase 2 question: oral + buzz + powers + the judging strip. */
export type VeDichRiengCtx = ScreenCore & {
    remaining: number | null
    mcVeDich: VeDichMc | null
    target: string | null
    setVerdict: (correct: boolean) => void
    setSelectedPlayer: (userId: string) => void
    verdictOf: (questionId: string, userId: string) => "CORRECT" | "INCORRECT" | null
    hetLuot: () => void
}

export function VeDichRiengAOCController({ ctx }: { ctx: VeDichRiengCtx }) {
    const { v, remaining, baseCards, mcVeDich, flash, openRounds } = ctx
    const projection = v.projection

    const stripCells = (projection.board ?? []).filter((c) => c.where === "open" || c.where === "pending")
    const openNow = projection.open[0]
    const qid = openNow.questionId
    // Both roles must be judged before the turn can close: the oral answerer
    // (always) and the buzzer (only when someone buzzed).
    const needsVerdict =
        mcVeDich?.answererId ? ctx.verdictOf(qid, mcVeDich.answererId) === null : true
    const buzzerMissing =
        mcVeDich?.buzzerId ? ctx.verdictOf(qid, mcVeDich.buzzerId) === null : false
    const turnOpen = needsVerdict || buzzerMissing

    // The MC declares the powers for the player whose question it is (the show's
    // deck is the operator's): STAR on their own answer, ASSIGN to the SELECTED
    // card. Both are Riêng-only rules, and both need a question about to open.
    const declarer = mcVeDich?.turnPlayerId ?? null
    const canDeclare = declarer !== null && mcVeDich?.openStage === "current" && mcVeDich.power === null
    const declare = (power: "STAR" | "ASSIGN") => {
        if (!declarer) return
        ctx.send({
            kind: "ve-dich.declarePower",
            playerId: declarer,
            power,
            ...(power === "ASSIGN" ? { targetId: ctx.target ?? "" } : {})
        })
    }

    // A duel runs on the QUESTION's clock, so there is no answer to close: the
    // engine would refuse it. Keep the slot inert while the pair races.
    const racing = mcVeDich?.power === "ASSIGN"

    return (
        <ConsoleStage
            rail={<Rail variant="compact" cards={baseCards} onSelect={ctx.setSelectedPlayer} />}
            actions={[
                {
                    label: "Mở chuông",
                    onClick: mcVeDich?.openStage === "current" && !racing
                        ? () => ctx.send({ kind: "ve-dich.closeCurrentAnswer" })
                        : undefined,
                },
                {
                    label: COPY.powerStar,
                    onClick: canDeclare ? () => declare("STAR") : undefined,
                },
                {
                    label: COPY.powerAssign,
                    // The target is the card the MC clicked — no card, no button.
                    onClick: canDeclare && ctx.target ? () => declare("ASSIGN") : undefined,
                },
                ...verdictActions({ canVerdict: ctx.target !== null, onVerdict: ctx.setVerdict }),
                { label: COPY.endTurn, onClick: turnOpen ? undefined : () => ctx.hetLuot() },
                backToLobbyAction(ctx.ketThuc),
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
