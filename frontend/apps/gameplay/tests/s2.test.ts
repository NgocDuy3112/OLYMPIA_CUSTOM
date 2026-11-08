import { describe, expect, it } from "vitest"
import { s2IndexOf, s2QuestionOf, type S2Selection } from "@/lib/s2"
import type { PlayerView } from "@shared/deck/types"


type Open = PlayerView["open"]

const open = (ids: string[]): Open =>
    ids.map((questionId) => ({ questionId, deadlineAt: null, question: null })) as unknown as Open

const sel = (qid: string, idx: number): S2Selection => ({ qid, idx })

describe("s2IndexOf", () => {
    it("finds the remembered question", () => {
        expect(s2IndexOf("q2", open(["q1", "q2", "q3"]))).toBe(1)
    })

    it("answers -1 once the question left the batch", () => {
        expect(s2IndexOf("q9", open(["q1", "q2"]))).toBe(-1)
    })

    it("answers -1 for an empty batch", () => {
        expect(s2IndexOf("q1", open([]))).toBe(-1)
    })
})

describe("s2QuestionOf — the walk", () => {
    const walk = (over: Partial<Parameters<typeof s2QuestionOf>[0]> = {}) =>
        s2QuestionOf({ selection: sel("q2", 1), open: open(["q1", "q2", "q3"]), roundId: "khoi-dong", stage: "phase2", ...over })

    it("draws the remembered question, and marks its square", () => {
        expect(walk().idx).toBe(1)
        expect(walk().question?.questionId).toBe("q2")
    })

    it("follows a later click", () => {
        expect(walk({ selection: sel("q3", 2) }).question?.questionId).toBe("q3")
    })

    it("falls back to the clamped index when the clicked question closed", () => {
        const result = walk({ open: open(["q1", "q3"]), selection: sel("q2", 1) })
        expect(result.question?.questionId).toBe("q3")
        expect(result.idx).toBe(1)
    })

    it("clamps an index past the end of a shrunken batch", () => {
        const result = s2QuestionOf({ selection: sel("q9", 7), open: open(["q1", "q2"]), roundId: "khoi-dong", stage: "phase2" })
        expect(result.idx).toBe(1)
        expect(result.question?.questionId).toBe("q2")
    })

    it("draws nothing for an empty batch (never a stale question)", () => {
        const result = walk({ open: open([]) })
        expect(result.question).toBeUndefined()
        expect(result.idx).toBe(0)
    })
})

describe("s2QuestionOf — the walk belongs to S2 only", () => {
    it("ignores the remembered QID outside khởi động phase 2 — only the index counts", () => {
        const other = s2QuestionOf({ selection: sel("q3", 0), open: open(["q1", "q2", "q3"]), roundId: "ve-dich", stage: "phase1" })
        expect(other.question?.questionId).toBe("q1")
        expect(other.idx).toBe(0)
    })

    it("ignores it in khởi động phase 1 (the oral run owns the deck)", () => {
        const phase1 = s2QuestionOf({ selection: sel("q3", 0), open: open(["q1", "q2", "q3"]), roundId: "khoi-dong", stage: "phase1" })
        expect(phase1.question?.questionId).toBe("q1")
    })
})
