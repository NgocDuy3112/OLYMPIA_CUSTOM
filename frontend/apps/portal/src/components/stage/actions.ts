import type { StripItem } from "@shared/deck/stage"
import { COPY } from "@shared/deck/copy"

export function verdictActions({ canVerdict, onVerdict }: {
    canVerdict: boolean
    onVerdict: (correct: boolean) => void
}): StripItem[] {
    let correctClick: (() => void) | undefined = undefined
    if (canVerdict) correctClick = () => onVerdict(true)
    let wrongClick: (() => void) | undefined = undefined
    if (canVerdict) wrongClick = () => onVerdict(false)
    return [
        { label: COPY.correct, onClick: correctClick },
        { label: COPY.wrong, onClick: wrongClick },
    ]
}

export function backToLobbyAction(onClick: () => void): StripItem {
    return { label: COPY.backToLobby, onClick }
}
