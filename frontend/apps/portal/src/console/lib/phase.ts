import { isKnownRound, isWaitingStage } from "@shared/deck/geometry"

export interface ReadinessInput {
    entered: boolean
    atWaiting: boolean
    roundsView: boolean
    roundId: string
    stage: string
    viewPainted: boolean
    transportRefused: boolean
}

interface Readiness {
    roundScreenReady: boolean
    waiting: boolean
}

export function readinessOf(input: ReadinessInput): Readiness {
    const roundScreenReady =
        !input.atWaiting &&
        (input.entered || !isWaitingStage(input.stage)) &&
        isKnownRound(input.roundId) &&
        !input.roundsView
    const waiting = input.transportRefused || !input.viewPainted || !roundScreenReady
    return { roundScreenReady, waiting }
}
