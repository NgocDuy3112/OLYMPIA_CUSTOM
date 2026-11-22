import { isKnownRound, isWaitingStage } from "./geometry"
import type { LayoutKey, PlayerView } from "./types"

export type PlayerScreen =
    | "lobby"   
    | LayoutKey 

export function playerScreenOf(view: Pick<PlayerView, "roundId" | "stage" | "open" | "console" | "board">): PlayerScreen {
    const { roundId, stage, open } = view

    if (!isKnownRound(roundId)) return "lobby" 
    if (isWaitingStage(stage)) return "lobby"  

    switch (roundId) {
        case "khoi-dong":
            if (stage === "phase2") return "khoi-dong-chung"
            return "khoi-dong-rieng"
        case "giai-ma":
            return "giai-ma"
        case "but-pha":
            return "but-pha"
        default: // ve-dich
            if (open.length > 0) {
                if (stage === "phase2") return "ve-dich-rieng"
                return "ve-dich-chung"
            }
            // The controller confirmed the round's picks: the chung board still
            // waits for a chip, but everyone must already be on the play screen.
            if (view.console?.picksConfirmed === true) return "ve-dich-chung"
            // Older frames carry no `console`; the staged picks do the same job.
            if (stage !== "phase2" && (view.board ?? []).some((cell) => cell.where === "pending")) return "ve-dich-chung"
            return "ve-dich-pick"
    }
}
