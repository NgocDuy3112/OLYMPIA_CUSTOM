// The staff dialog's turn controls: pure decisions from the event's turn state.
// The dialog renders these; it never computes them inline (so the rules are testable
// and the disabled-button reasons are data, not JSX).
//
// Mirrors the backend's rules (docs/mass-event.md): closed beats everything the
// status could otherwise say; without a release the event has not opened; at the
// last question there is nothing left to advance to.

export interface MassEventTurnSource {
    closed: boolean
    opened: boolean
    currentPosition: number | null
    questionCount: number
    currentAnswered: number
    fieldSize: number
}

export type StaffControls =
    | { phase: "not-open" }
    | { phase: "closed" }
    | {
        phase: "open"
        /** 1-based — staff count questions the way the dialog labels them. */
        questionNumber: number
        questionCount: number
        /** The advance cue: how much of the field has answered the CURRENT question. */
        currentAnswered: number
        fieldSize: number
        canAdvance: boolean
        /** Why advance is disabled — a disabled button must state its reason. */
        advanceReason: string | null
    }

export function turnControls(view: MassEventTurnSource): StaffControls {
    if (view.closed) return { phase: "closed" }
    if (!view.opened || view.currentPosition === null) return { phase: "not-open" }

    const atLast = view.currentPosition >= view.questionCount - 1

    return {
        phase: "open",
        questionNumber: view.currentPosition + 1,
        questionCount: view.questionCount,
        currentAnswered: view.currentAnswered,
        fieldSize: view.fieldSize,
        canAdvance: !atLast,
        advanceReason: atLast
            ? "Đây là câu cuối — đóng sự kiện để kết thúc."
            : null,
    }
}
