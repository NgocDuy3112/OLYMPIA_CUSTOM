import { describe, expect, it } from "vitest"
import { hintPool, mergedVerdicts, type ConsoleQuestion, type GiaiMaConsole, type QuestionAnswerRow } from "@/lib/live"


const question = (over: Partial<ConsoleQuestion>): ConsoleQuestion => ({
    _id: "q",
    kind: "CHOICE",
    roundId: "giai-ma",
    turnId: "hints",
    position: 0,
    questionText: "text",
    timeLimit: null,
    points: 10,
    payload: {},
    ...over,
})

const giaiMaMc = (over: Partial<GiaiMaConsole> = {}): GiaiMaConsole => ({
    hintsRemaining: [],
    hintsPicked: [],
    openHintId: null,
    windowOpen: false,
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


describe("mergedVerdicts", () => {
    it("sends ONLY the explicitly staged rows — nothing defaults", () => {
        const rows = [
            row({ userId: "p1", verdict: "CORRECT" }),
            row({ userId: "p2", verdict: "INCORRECT" }),
            row({ userId: "p3", verdict: null }),
        ]
        expect(mergedVerdicts("q9", rows, { "q9:p2": true })).toEqual([
            { playerId: "p2", correct: true }    
        ])
        expect(mergedVerdicts("q9", rows, {})).toEqual([])
    })

    it("an override on one question never leaks to another", () => {
        const rows = [row({ userId: "p1", verdict: "INCORRECT" })]
        expect(mergedVerdicts("q1", rows, { "q1:p1": true })).toEqual([
            { playerId: "p1", correct: true }
        ])
        expect(mergedVerdicts("q2", rows, { "q1:p1": true })).toEqual([])   
    })
})
