import { describe, expect, it } from "vitest"
import { hintPool, mergedVerdicts, startActionPayload, type ConsoleQuestion, type GiaiMaMc, type QuestionAnswerRow } from "@/lib/live"

// The console's pure decisions: which hints remain, what start must carry,
// and which verdicts a finalize sends (engine draft, MC overwrite wins).

const question = (over: Partial<ConsoleQuestion>): ConsoleQuestion => ({
    _id: "q",
    kind: "MC",
    roundId: "giai-ma",
    turnId: "hints",
    position: 0,
    questionText: "text",
    timeLimit: null,
    points: 10,
    domain: "THTH",
    payload: {},
    ...over,
})

const giaiMaMc = (over: Partial<GiaiMaMc> = {}): GiaiMaMc => ({
    hintsRemaining: [],
    hintsPicked: [],
    openHintId: null,
    players: [],
    ...over,
})

const row = (over: Partial<QuestionAnswerRow>): QuestionAnswerRow => ({
    userId: "p1",
    value: null,
    verdict: "CORRECT",
    judged: false,
    pointsAwarded: null,
    ...over,
})


describe("hintPool", () => {
    const questions = [
        question({ _id: "h1", questionText: "First hint" }),
        question({ _id: "h2", questionText: "Second hint" }),
        question({ _id: "kw", kind: "KEYWORD", turnId: "keyword", questionText: "Keyword" }),
    ]

    it("lists remaining hints with their text, never the keyword question", () => {
        const pool = hintPool(giaiMaMc({ hintsRemaining: ["h1", "h2"] }), questions)
        expect(pool).toEqual([
            { questionId: "h1", text: "First hint" },
            { questionId: "h2", text: "Second hint" },
        ])
    })

    it("hides the currently open window and anything already consumed", () => {
        const pool = hintPool(
            giaiMaMc({ hintsRemaining: ["h1", "h2"], openHintId: "h1", hintsPicked: ["h2"] }),
            questions
        )
        expect(pool).toEqual([])
    })

    it("an absent mc is an empty pool, not a crash", () => {
        expect(hintPool(null, questions)).toEqual([])
    })

    it("an id the frozen set does not know degrades to the id as text", () => {
        const pool = hintPool(giaiMaMc({ hintsRemaining: ["ghost"] }), questions)
        expect(pool).toEqual([{ questionId: "ghost", text: "ghost" }])
    })
})


describe("startActionPayload", () => {
    it("giai-ma carries the field and the hint order (keyword excluded, position-sorted)", () => {
        const questions = [
            question({ _id: "b", position: 2 }),
            question({ _id: "a", position: 1 }),
            question({ _id: "kw", kind: "KEYWORD", turnId: "keyword", position: 0 }),
            question({ _id: "other", roundId: "but-pha", position: 0 }),
        ]
        expect(startActionPayload("giai-ma", ["p1", "p2"], questions)).toEqual({
            playerIds: ["p1", "p2"],
            hintIds: ["a", "b"],
        })
    })

    it("every other round starts bare", () => {
        expect(startActionPayload("khoi-dong", ["p1"], [question({})])).toEqual({})
        expect(startActionPayload("but-pha", ["p1"], [question({})])).toEqual({})
        expect(startActionPayload("ve-dich", ["p1"], [question({})])).toEqual({})
    })
})


describe("mergedVerdicts", () => {
    it("defaults to the engine's draft and lets the MC overwrite it", () => {
        const rows = [
            row({ userId: "p1", verdict: "CORRECT" }),
            row({ userId: "p2", verdict: "INCORRECT" }),
            row({ userId: "p3", verdict: null }),
        ]
        expect(mergedVerdicts("q9", rows, { "q9:p2": true })).toEqual([
            { playerId: "p1", correct: true },
            { playerId: "p2", correct: true },   // MC flipped the draft
            { playerId: "p3", correct: false },  // nothing matched → wrong until flipped
        ])
    })

    it("an override on one question never leaks to another", () => {
        const rows = [row({ userId: "p1", verdict: "INCORRECT" })]
        expect(mergedVerdicts("q1", rows, { "q1:p1": true })[0].correct).toBe(true)
        expect(mergedVerdicts("q2", rows, { "q1:p1": true })[0].correct).toBe(false)
    })
})
