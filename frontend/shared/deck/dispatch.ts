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
        default:
            if (open.length > 0) {
                if (stage === "phase2") return "ve-dich-rieng"
                return "ve-dich-chung"
            }
            if (view.console?.picksConfirmed === true) return "ve-dich-chung"
            return "ve-dich-pick"
    }
}
