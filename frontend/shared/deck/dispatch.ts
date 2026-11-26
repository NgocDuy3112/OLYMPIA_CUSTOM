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
            // Once the console confirms the picks the board is closed for good
            // (rules.md §7.4) — the player waits on the screen of the phase the
            // room is playing, even before the next question opens.
            if (view.console?.picksConfirmed === true) {
                if (stage === "phase2") return "ve-dich-rieng"
                return "ve-dich-chung"
            }
            return "ve-dich-pick"
    }
}
