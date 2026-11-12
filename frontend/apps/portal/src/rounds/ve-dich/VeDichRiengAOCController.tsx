import { ConsoleStage, QuestionCard, Rail, Timer, VeDichStripCells } from "@/components/stage/deck"
import { backToLobbyAction, verdictActions } from "@/components/stage/actions"
import { COPY } from "@shared/deck/copy"
import { formatBuzzMs } from "@shared/lib/clock"

import type { VeDichConsole } from "@/lib/live"
import type { ScreenCore } from "../types"

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
    const needsVerdict =
        consoleVeDich?.answererId ? ctx.verdictOf(qid, consoleVeDich.answererId) === null : true
    const buzzerMissing =
        consoleVeDich?.buzzerId ? ctx.verdictOf(qid, consoleVeDich.buzzerId) === null : false
    const turnOpen = needsVerdict || buzzerMissing

    const racing = consoleVeDich?.power === "ASSIGN"
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
            <QuestionCard
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
