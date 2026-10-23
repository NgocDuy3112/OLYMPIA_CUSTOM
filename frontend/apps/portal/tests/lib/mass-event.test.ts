import { describe, expect, it } from "vitest"
import { turnControls, type MassEventTurnSource } from "@/lib/mass-event"

// The dialog's three phases and the disabled-button reason — the backend's turn
// rules (docs/mass-event.md) as pure decisions.

const view = (overrides: Partial<MassEventTurnSource> = {}): MassEventTurnSource => ({
    closed: false,
    opened: false,
    currentPosition: null,
    questionCount: 8,
    currentAnswered: 0,
    fieldSize: 12,
    ...overrides,
})

describe("turnControls", () => {
    it("before open: the open gate, nothing to advance", () => {
        const controls = turnControls(view())
        expect(controls.phase).toBe("not-open")
    })

    it("mid-event: question number, the count, and a live advance", () => {
        const controls = turnControls(view({ opened: true, currentPosition: 2, currentAnswered: 5 }))
        expect(controls).toMatchObject({
            phase: "open",
            questionNumber: 3, // staff count from 1, the server counts from 0
            questionCount: 8,
            currentAnswered: 5,
            fieldSize: 12,
            canAdvance: true,
            advanceReason: null,
        })
    })

    it("at the last question: advance is disabled and states why", () => {
        const controls = turnControls(view({ opened: true, currentPosition: 7 }))
        expect(controls).toMatchObject({ phase: "open", questionNumber: 8, canAdvance: false })
        if (controls.phase !== "open") throw new Error("expected the open phase")
        expect(controls.advanceReason).toContain("last question")
    })

    it("closed wins over any other status", () => {
        // A match can be closed without ever opening — the ranking view still shows.
        expect(turnControls(view({ closed: true })).phase).toBe("closed")
        expect(turnControls(view({ closed: true, opened: true, currentPosition: 3 })).phase).toBe("closed")
    })

    it("an opened flag without a position is still the open gate", () => {
        // Defensive: `opened` and `currentPosition` come from the same row — if they
        // ever disagree, there is nothing released, so the gate stands.
        expect(turnControls(view({ opened: true, currentPosition: null })).phase).toBe("not-open")
    })

    it("a one-question event opens already at its last question", () => {
        const controls = turnControls(view({ opened: true, currentPosition: 0, questionCount: 1 }))
        expect(controls).toMatchObject({ phase: "open", questionNumber: 1, canAdvance: false })
    })
})
