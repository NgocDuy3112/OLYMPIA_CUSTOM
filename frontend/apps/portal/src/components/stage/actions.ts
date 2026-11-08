import type { StripItem } from "@shared/deck/stage"
import { COPY } from "@shared/deck/copy"

export function verdictActions({ canVerdict, onVerdict }: {
    canVerdict: boolean
    onVerdict: (correct: boolean) => void
}): StripItem[] {
    return [
        { label: COPY.correct, onClick: canVerdict ? () => onVerdict(true) : undefined },
        { label: COPY.wrong, onClick: canVerdict ? () => onVerdict(false) : undefined },
    ]
}

export function backToLobbyAction(onClick: () => void): StripItem {
    return { label: COPY.backToLobby, onClick }
}
