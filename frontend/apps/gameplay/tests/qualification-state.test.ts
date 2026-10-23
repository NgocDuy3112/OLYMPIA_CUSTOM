import { describe, expect, it } from "vitest"
import {
    derivePhase,
    dotsFor,
    isAnswerable,
    ledgerFor,
    tally,
    type QualificationView,
    type ReleasedQuestion,
} from "@/lib/qualification-state"

// The five screens as pure decisions: which phase, which dots, which ledger.

const question = (position: number): ReleasedQuestion => ({
    questionId: `q${position}`,
    kind: "MC",
    position,
    questionText: `Question ${position}`,
    media: null,
    timeLimit: null,
    tag: "THTH",
    payload: { options: [{ id: "a", text: "A" }, { id: "b", text: "B" }] },
})

const view = (overrides: Partial<QualificationView> = {}): QualificationView => ({
    closed: false,
    label: "Event",
    currentPosition: 0,
    totalQuestions: 3,
    questions: [question(0)],
    answers: [],
    ...overrides,
})

const failure = (status: number, code?: string, message?: string) => ({ status, code, message })


describe("derivePhase", () => {
    it("gate-login: signed out, or a 401 that arrived anyway", () => {
        expect(derivePhase(undefined, null, true).kind).toBe("gate-login")
        expect(derivePhase(undefined, failure(401), false).kind).toBe("gate-login")
    })

    it("gate-not-seated on 403 / NOT_ENROLLED", () => {
        expect(derivePhase(undefined, failure(403, "NOT_ENROLLED"), false).kind).toBe("gate-not-seated")
        expect(derivePhase(undefined, failure(400, "NOT_ENROLLED"), false).kind).toBe("gate-not-seated")
    })

    it("gate-waiting on 409 NOT_OPEN — the staff have not released anything", () => {
        expect(derivePhase(undefined, failure(409, "NOT_OPEN"), false).kind).toBe("gate-waiting")
    })

    it("any other failure SAYS WHY instead of pretending to wait", () => {
        const phase = derivePhase(undefined, failure(500, undefined, "boom"), false)
        expect(phase).toEqual({ kind: "error", message: "boom" })
    })

    it("question: the turn is out and unanswered", () => {
        const phase = derivePhase(view(), null, false)
        expect(phase).toEqual({ kind: "question", question: question(0) })
    })

    it("waiting: current answered, later questions still unreleased", () => {
        const phase = derivePhase(
            view({
                answers: [{ questionId: "q0", verdict: "CORRECT", value: { picked: ["a"] }, pointsAwarded: 0 }]
            }),
            null,
            false
        )
        expect(phase.kind).toBe("waiting")
    })

    it("done: the LAST question answered, even with earlier misses", () => {
        const phase = derivePhase(
            view({
                currentPosition: 2,
                questions: [question(0), question(1), question(2)],
                answers: [
                    // q0 missed entirely (not in answers), q1 wrong, q2 right → still done
                    { questionId: "q1", verdict: "INCORRECT", value: { picked: ["b"] }, pointsAwarded: -2 },
                    { questionId: "q2", verdict: "CORRECT", value: { picked: ["a"] }, pointsAwarded: 4 },
                ],
            }),
            null,
            false
        )
        expect(phase.kind).toBe("done")
    })

    it("results: closed beats every other reading", () => {
        expect(derivePhase(view({ closed: true }), null, false).kind).toBe("results")
        expect(derivePhase(
            view({ closed: true, currentPosition: null, questions: [] }),
            null,
            false
        ).kind).toBe("results")
    })
})


describe("isAnswerable", () => {
    it("only the turn's own unanswered question", () => {
        const v = view({ questions: [question(0), question(1)], currentPosition: 1 })
        expect(isAnswerable(v, question(1))).toBe(true)
        expect(isAnswerable(v, question(0))).toBe(false)     // the turn moved on
        expect(isAnswerable(v, question(2))).toBe(false)     // not released
    })

    it("never once answered, never once closed", () => {
        const answeredView = view({
            answers: [{ questionId: "q0", verdict: "CORRECT", value: { picked: ["a"] }, pointsAwarded: 1 }]
        })
        expect(isAnswerable(answeredView, question(0))).toBe(false)
        expect(isAnswerable(view({ closed: true }), question(0))).toBe(false)
    })
})


describe("dotsFor", () => {
    it("shows the whole set: answered / current / future as counts only", () => {
        const dots = dotsFor(view())
        expect(dots).toEqual(["current", "future", "future"])
    })

    it("missed questions surface as missed, not as future", () => {
        const dots = dotsFor(view({
            currentPosition: 2,
            questions: [question(0), question(1), question(2)],
            answers: [{ questionId: "q2", verdict: "CORRECT", value: { picked: ["a"] }, pointsAwarded: 0 }],
        }))
        expect(dots).toEqual(["missed", "missed", "correct"])
    })

    it("after close nothing is current", () => {
        const dots = dotsFor(view({
            closed: true,
            questions: [question(0), question(1)],
            answers: [{ questionId: "q1", verdict: "INCORRECT", value: { picked: ["b"] }, pointsAwarded: 0 }],
        }))
        expect(dots).toEqual(["missed", "wrong", "future"])
    })
})


describe("ledgerFor / tally", () => {
    const v = view({
        closed: true,
        currentPosition: 1,
        totalQuestions: 4,
        questions: [question(0), question(1)],
        answers: [
            { questionId: "q0", verdict: "CORRECT", value: { picked: ["a"] }, pointsAwarded: 3 },
            { questionId: "q1", verdict: "INCORRECT", value: { picked: ["b"] }, pointsAwarded: -2 },
        ],
    })

    it("separates answered, missed and not-played — a never-released question is not a miss", () => {
        const rows = ledgerFor(v)
        expect(rows.map((row) => row.kind)).toEqual(["answered", "answered", "not-played", "not-played"])
        expect(rows[2]).toEqual({ position: 2, kind: "not-played" })
    })

    it("missed only appears when a question WAS released and went unanswered", () => {
        const rows = ledgerFor(view({
            closed: true,
            currentPosition: 2,
            questions: [question(0), question(1), question(2)],
            totalQuestions: 3,
            answers: [{ questionId: "q0", verdict: "CORRECT", value: { picked: ["a"] }, pointsAwarded: 5 }],
        }))
        expect(rows.map((row) => row.kind)).toEqual(["answered", "missed", "missed"])
    })

    it("tally counts correct verdicts and sums the crowd points (which can be negative)", () => {
        expect(tally(v)).toEqual({ correct: 1, points: 1 })
    })
})
