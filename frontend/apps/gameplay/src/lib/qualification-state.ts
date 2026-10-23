export interface ReleasedQuestion {
    questionId: string
    kind: "MC" | "TEXT" | "KEYWORD"
    position: number
    questionText: string
    media: { url: string; type: "image" | "audio" | "video" } | null
    timeLimit: number | null
    tag: string
    // MC carries options; never the correct set — verdict-only feedback is the API's rule.
    payload: { options?: Array<{ id: string; text: string }> }
}

export interface PlayerAnswer {
    questionId: string
    verdict: "CORRECT" | "INCORRECT"
    // The player's own submission, for review after a reload.
    value: { picked?: string[]; text?: string }
    pointsAwarded: number
}

export interface QualificationView {
    closed: boolean
    label: string
    // null only when closed without ever opening.
    currentPosition: number | null
    totalQuestions: number
    questions: ReleasedQuestion[]     // position ≤ currentPosition, sorted
    answers: PlayerAnswer[]
}

// The error codes the API can answer with — each is a screen, not a crash.
export interface ViewFailure {
    status: number
    code?: string
    message?: string
}


// ── The screens ─────────────────────────────────────────────────────────────

export type QualificationPhase =
    | { kind: "gate-login" }                      // 401 / no session
    | { kind: "gate-not-seated" }                 // 403 NOT_ENROLLED
    | { kind: "gate-waiting" }                    // 409 NOT_OPEN
    | { kind: "question"; question: ReleasedQuestion }
    | { kind: "waiting" }                         // current answered, more to come
    | { kind: "done" }                            // current is the last, answered
    | { kind: "results" }                         // closed
    | { kind: "error"; message: string }          // anything else — say why, stay calm

export function derivePhase(
    view: QualificationView | undefined,
    failure: ViewFailure | null,
    signedOut: boolean
): QualificationPhase {
    if (signedOut) return { kind: "gate-login" }

    if (failure) {
        if (failure.status === 401) return { kind: "gate-login" }
        if (failure.status === 403 || failure.code === "NOT_ENROLLED") return { kind: "gate-not-seated" }
        if (failure.status === 409 && failure.code === "NOT_OPEN") return { kind: "gate-waiting" }
        return { kind: "error", message: failure.message ?? "Không tải được sự kiện." }
    }

    if (!view) return { kind: "gate-waiting" }    // loading reads as waiting, never as a blank

    if (view.closed) return { kind: "results" }

    const current = currentQuestion(view)
    if (!current) return { kind: "gate-waiting" } // open with nothing released cannot happen; degrade kindly

    if (!answered(view, current.questionId)) return { kind: "question", question: current }

    // Current is answered: the turn is either waiting for staff, or over for this player.
    if (view.currentPosition !== null && view.currentPosition >= view.totalQuestions - 1) {
        return { kind: "done" }
    }
    return { kind: "waiting" }
}

// The current released question — the server sends the released set sorted, and
// the last one is the turn (position === currentPosition).
export function currentQuestion(view: QualificationView): ReleasedQuestion | undefined {
    return view.questions[view.questions.length - 1]
}

export function answered(view: QualificationView, questionId: string): PlayerAnswer | undefined {
    return view.answers.find((row) => row.questionId === questionId)
}

// Answerable = the turn's own question, still unanswered, event open. Everything
// else released is review: verdicts and misses, locked forever.
export function isAnswerable(view: QualificationView, question: ReleasedQuestion): boolean {
    if (view.closed) return false
    if (question.position !== view.currentPosition) return false
    return !answered(view, question.questionId)
}


// ── The dots ────────────────────────────────────────────────────────────────

export type DotState = "correct" | "wrong" | "missed" | "current" | "future"

export function dotsFor(view: QualificationView): DotState[] {
    const dots: DotState[] = []
    for (let position = 0; position < view.totalQuestions; position++) {
        const question = view.questions.find((q) => q.position === position)
        if (!question) {
            dots.push("future")   // released set is contiguous from 0; past the end is not played
            continue
        }
        const answer = answered(view, question.questionId)
        if (answer) {
            dots.push(answer.verdict === "CORRECT" ? "correct" : "wrong")
            continue
        }
        if (!view.closed && position === view.currentPosition) {
            dots.push("current")
            continue
        }
        dots.push("missed")
    }
    return dots
}


// ── The results ledger ──────────────────────────────────────────────────────

export type LedgerRow =
    | { position: number; kind: "answered"; answer: PlayerAnswer }
    | { position: number; kind: "missed" }         // released, never answered
    | { position: number; kind: "not-played" }     // never released (closed before)


export function ledgerFor(view: QualificationView): LedgerRow[] {
    const rows: LedgerRow[] = []
    for (let position = 0; position < view.totalQuestions; position++) {
        const question = view.questions.find((q) => q.position === position)
        if (!question) {
            rows.push({ position, kind: "not-played" })
            continue
        }
        const answer = answered(view, question.questionId)
        rows.push(answer
            ? { position, kind: "answered", answer }
            : { position, kind: "missed" })
    }
    return rows
}

export function tally(view: QualificationView): { correct: number; points: number } {
    let correct = 0
    let points = 0
    for (const answer of view.answers) {
        if (answer.verdict === "CORRECT") correct += 1
        points += answer.pointsAwarded
    }
    return { correct, points }
}
