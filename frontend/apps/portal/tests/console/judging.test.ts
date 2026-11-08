import { describe, expect, it } from "vitest"
import { judgingIdsOf, targetOf, type JudgingInput } from "@/console/lib/judging"
import type { ConsoleQuestion } from "@/lib/live"


const q = (id: string, roundId: string, kind = "CHOICE"): ConsoleQuestion =>
    ({ _id: id, roundId, kind, position: 1 } as unknown as ConsoleQuestion)

const QUESTIONS = [
    q("k1", "khoi-dong"),
    q("b1", "but-pha"),
    q("g1", "giai-ma", "CHOICE"),
    q("gk", "giai-ma", "KEYWORD"),
    q("v1", "ve-dich"),
]

function input(over: Partial<JudgingInput> = {}): JudgingInput {
    return { roundId: "khoi-dong", questions: QUESTIONS, openIds: [], selectedQ: null, ...over }
}

describe("judgingIdsOf — the clicked-question rounds (khởi động, bút phá)", () => {
    it("reads the first open question when nothing was clicked", () => {
        expect(judgingIdsOf(input({ openIds: ["k1", "k2"] })).judgingId).toBe("k1")
    })

    it("reads the CLICKED question while it is still open", () => {
        expect(judgingIdsOf(input({ openIds: ["k1", "k2"], selectedQ: "k2" })).judgingId).toBe("k2")
    })

    it("falls back to the open one when the click outlived its window", () => {
        expect(judgingIdsOf(input({ openIds: ["k2"], selectedQ: "k1" })).judgingId).toBe("k2")
    })

    it("reads nothing between questions", () => {
        expect(judgingIdsOf(input({ openIds: [] })).judgingId).toBeNull()
    })

    it("never resolves a turn (that is ve-dich's notion)", () => {
        expect(judgingIdsOf(input({ openIds: ["k1"] })).resolvingId).toBeNull()
    })
})

describe("judgingIdsOf — giải mã reads the window, then the keyword drafts", () => {
    it("reads the open hint window while it runs", () => {
        const ids = judgingIdsOf(input({ roundId: "giai-ma", openIds: ["g1"] }))
        expect(ids.judgingId).toBe("g1")
        expect(ids.keywordQuestionId).toBe("gk")
    })

    it("reads the KEYWORD question between windows (Đúng từ khoá judges it)", () => {
        const ids = judgingIdsOf(input({ roundId: "giai-ma", openIds: [] }))
        expect(ids.judgingId).toBe("gk")
    })

    it("keeps the keyword id even when a hint is open (the commit needs it later)", () => {
        expect(judgingIdsOf(input({ roundId: "giai-ma", openIds: ["g1"] })).keywordQuestionId).toBe("gk")
    })

    it("does not let a click hijack the window", () => {
        const ids = judgingIdsOf(input({ roundId: "giai-ma", openIds: ["g1"], selectedQ: "k1" }))
        expect(ids.judgingId).toBe("g1")
    })

    it("has no keyword question on the other rounds", () => {
        expect(judgingIdsOf(input({ roundId: "ve-dich", openIds: ["v1"] })).keywordQuestionId).toBeNull()
    })
})

describe("judgingIdsOf — về đích reads the open TURN", () => {
    it("resolves the open turn's question", () => {
        const ids = judgingIdsOf(input({ roundId: "ve-dich", openIds: ["v1"] }))
        expect(ids.resolvingId).toBe("v1")
        expect(ids.judgingId).toBeNull()
    })

    it("resolves nothing between turns", () => {
        expect(judgingIdsOf(input({ roundId: "ve-dich", openIds: [] })).resolvingId).toBeNull()
    })
})

describe("judgingIdsOf — unknown rounds", () => {
    it("reads nothing (no module, no ledger, the lobby owns it)", () => {
        const ids = judgingIdsOf(input({ roundId: "khong-ton-tai", openIds: ["x"] }))
        expect(ids).toEqual({ judgingId: null, resolvingId: null, keywordQuestionId: null })
    })
})

describe("targetOf — the verdict target", () => {
    it("prefers the clicked card when it answered", () => {
        expect(targetOf(["u1", "u2"], "u2")).toBe("u2")
    })

    it("ignores a click on someone who did not answer", () => {
        expect(targetOf(["u1", "u2"], "u3")).toBe("u1")
    })

    it("falls back to the first answerer", () => {
        expect(targetOf(["u2", "u1"], null)).toBe("u2")
    })

    it("is null with no answers at all", () => {
        expect(targetOf([], "u1")).toBeNull()
    })
})
