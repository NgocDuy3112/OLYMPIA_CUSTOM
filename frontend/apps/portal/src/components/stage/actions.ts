// The the console's action vocabulary as small plans, so no controller writes the same
// three strip items by hand. Pure functions (no components): they belong to the
// strip's meaning, not to a screen.
//
// `canVerdict` is the caller's call — the round knows when a verdict is legal
// (a target is selected, the oral run is inside budget, a question is open).
import type { StripItem } from "@shared/deck/stage"
import { COPY } from "@shared/deck/copy"

/** The Đúng / Sai pair — disabled (display-only) until the round allows a verdict. */
export function verdictActions({ canVerdict, onVerdict }: {
    canVerdict: boolean
    onVerdict: (correct: boolean) => void
}): StripItem[] {
    return [
        { label: COPY.correct, onClick: canVerdict ? () => onVerdict(true) : undefined },
        { label: COPY.wrong, onClick: canVerdict ? () => onVerdict(false) : undefined },
    ]
}

/** Về sảnh — the round's own end plan (the module decides what it sends). */
export function backToLobbyAction(onClick: () => void): StripItem {
    return { label: COPY.backToLobby, onClick }
}
