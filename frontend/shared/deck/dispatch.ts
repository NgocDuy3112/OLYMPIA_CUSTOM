// WHICH screen a live view draws — the one pure rule both read-only surfaces
// share: the player deck and the audience's deck. It lives with the kit (not in
// an app) so the audience can route rounds without importing the player app.
//
// One reason per line: the lobby wins whenever a round screen does not exist.
import { isKnownRound, isWaitingStage } from "./geometry"
import type { LayoutKey, PlayerView } from "./types"

export type PlayerScreen =
    | "lobby"   // round not started / ended — waiting for the MC
    | LayoutKey // one of the deck's seven round screens (see ./types)

/** The view is the only input, so this is unit-testable and never re-derived. */
export function playerScreenOf(view: Pick<PlayerView, "roundId" | "stage" | "open">): PlayerScreen {
    const { roundId, stage, open } = view

    if (!isKnownRound(roundId)) return "lobby" // a round this client has no screen for
    if (isWaitingStage(stage)) return "lobby"  // not started / over / unrecognized stage

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
