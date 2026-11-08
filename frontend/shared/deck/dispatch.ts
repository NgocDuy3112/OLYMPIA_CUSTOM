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
            return stage === "phase2" ? "khoi-dong-chung" : "khoi-dong-rieng"
        case "giai-ma":
            return "giai-ma"
        case "but-pha":
            return "but-pha"
        default: // ve-dich
            return open.length === 0
                ? "ve-dich-pick"
                : stage === "phase2" ? "ve-dich-rieng" : "ve-dich-chung"
    }
}
