import { isKnownRound, isWaitingStage } from "./geometry"
import type { LayoutKey, PlayerView } from "./types"

export type PlayerScreen =
    | "lobby"   
    | LayoutKey 

export function playerScreenOf(view: Pick<PlayerView, "roundId" | "stage" | "open">): PlayerScreen {
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
            if (open.length === 0) return "ve-dich-pick"
            if (stage === "phase2") return "ve-dich-rieng"
            return "ve-dich-chung"
    }
}
