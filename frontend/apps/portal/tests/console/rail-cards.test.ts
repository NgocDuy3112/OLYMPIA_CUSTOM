import { describe, expect, it } from "vitest"
import { railCardsOf, type RailCardsInput } from "@/console/lib/rail-cards"
import type { GiaiMaConsole, KhoiDongConsole, QuestionAnswerRow, VeDichConsole } from "@/lib/live"

// The console rail's card table. Before this file the whole projection lived in
// a loop inside useConsoleModel and was only typecheck-covered: a wrong ring or
// a badge on the wrong player is a wrong projector, so every rule gets a row.

const TABLE = [
    { id: "u1", displayName: "An", points: 10, rank: 1 },
    { id: "u2", displayName: "Bình", points: 20, rank: 2 },
]

function row(over: Partial<QuestionAnswerRow> = {}): QuestionAnswerRow {
    return {
        userId: "u1",
        verdict: null,
        pointsAwarded: null,
        value: { text: "một đáp án" },
        ...over,
    } as QuestionAnswerRow
}

function input(over: Partial<RailCardsInput> = {}): RailCardsInput {
    return {
        table: TABLE,
        rows: [],
        roundId: "khoi-dong",
        railVariant: "compact",
        railQ: null,
        railQuestion: null,
        judgingId: null,
        resolvingId: null,
        target: null,
        selectedIds: new Set<string>(),
        videoOf: () => null,
        verdictOf: () => null,
        giaiMa: null,
        veDich: null,
        khoiDong: null,
        oralPlayerId: null,
        ...over,
    }
}

const ringOf = (cards: ReturnType<typeof railCardsOf>, id: string) =>
    cards.find((c) => c.id === id)?.ring
const badgeOf = (cards: ReturnType<typeof railCardsOf>, id: string) =>
    cards.find((c) => c.id === id)?.badge?.text

describe("railCardsOf — one card per score row", () => {
    it("keeps the table order and copies id/name/points", () => {
        const cards = railCardsOf(input())
        expect(cards.map((c) => c.id)).toEqual(["u1", "u2"])
        expect(cards.map((c) => c.name)).toEqual(["An", "Bình"])
        expect(cards.map((c) => c.points)).toEqual([10, 20])
    })

    it("attaches the camera the transport hands out, per id", () => {
        const track = { id: "track-u2" } as never
        const cards = railCardsOf(input({ videoOf: (id) => (id === "u2" ? track : null) }))
        expect(cards.find((c) => c.id === "u2")?.video).toBe(track)
        expect(cards.find((c) => c.id === "u1")?.video).toBeNull()
    })
})

describe("railCardsOf — the ring: giai-ma marks the multi-select, other rounds the target", () => {
    it("rings the selected set on giai-ma", () => {
        const cards = railCardsOf(input({
            roundId: "giai-ma",
            judgingId: "q1",
            selectedIds: new Set(["u2"]),
            // a verdict target must NOT ring on giai-ma — the multi-select owns it
            target: "u1",
        }))
        expect(ringOf(cards, "u2")).toBe("selected")
        expect(ringOf(cards, "u1")).toBeUndefined()
    })

    it("reads a stale selection as nothing (no judging id)", () => {
        const cards = railCardsOf(input({
            roundId: "giai-ma",
            judgingId: null,
            selectedIds: new Set(["u2"]),
        }))
        expect(cards.every((c) => c.ring === undefined)).toBe(true)
    })

    it("rings the verdict target on the other rounds", () => {
        const cards = railCardsOf(input({ roundId: "but-pha", judgingId: "q1", target: "u1" }))
        expect(ringOf(cards, "u1")).toBe("selected")
        expect(ringOf(cards, "u2")).toBeUndefined()
    })

    it("rings nothing when no question is being judged or resolved", () => {
        const cards = railCardsOf(input({ roundId: "but-pha", target: "u1" }))
        expect(cards.every((c) => c.ring === undefined)).toBe(true)
    })

    it("lets an open oral run own the ring (active), overriding the target", () => {
        const cards = railCardsOf(input({
            roundId: "ve-dich",
            resolvingId: "q1",
            target: "u1",
            oralPlayerId: "u2",
        }))
        expect(ringOf(cards, "u2")).toBe("active")
        expect(ringOf(cards, "u1")).toBeUndefined()
    })
})

describe("railCardsOf — the answers rail", () => {
    it("leaves the bottom lines off a compact rail", () => {
        const cards = railCardsOf(input({ rows: [row()], railVariant: "compact", railQ: "q1", judgingId: "q1" }))
        expect(cards[0].answer).toBeUndefined()
        expect(cards[0].value).toBeUndefined()
    })

    it("shows the answer text, the awarded points, and the CALLER's verdict", () => {
        const cards = railCardsOf(input({
            rows: [row({ pointsAwarded: 15, verdict: "INCORRECT" })],
            railVariant: "answers",
            railQ: "q1",
            judgingId: "q1",
            // the staged override outranks the submitted verdict — the rail must
            // report what verdictOf says, not what the row says
            verdictOf: () => "CORRECT",
        }))
        expect(cards[0].answer).toBe("“một đáp án”")
        expect(cards[0].value).toBe("15")
        expect(cards[0].verdict).toBe("CORRECT")
    })

    it("says '…' while the verdict is still open, and the value once judged", () => {
        const pending = railCardsOf(input({
            rows: [row({ verdict: null })], railVariant: "answers", railQ: "q1", judgingId: "q1",
        }))
        expect(pending[0].value).toBe("…")
        const judged = railCardsOf(input({
            rows: [row({ verdict: "CORRECT" })], railVariant: "answers", railQ: "q1", judgingId: "q1",
        }))
        expect(judged[0].value).toBe("“một đáp án”")
    })

    it("shows an em dash for a player who did not answer", () => {
        const cards = railCardsOf(input({ railVariant: "answers", railQ: "q1", judgingId: "q1" }))
        expect(cards.map((c) => c.answer)).toEqual(["—", "—"])
        expect(cards.map((c) => c.value)).toEqual(["—", "—"])
    })

    it("does not describe answers with no question in hand", () => {
        const cards = railCardsOf(input({ rows: [row()], railVariant: "answers", railQ: null }))
        expect(cards[0].answer).toBeUndefined()
    })
})

describe("railCardsOf — the live answerer wears the purple card", () => {
    it("marks ve-dich's buzz winner", () => {
        const veDich = { buzzerId: "u2", power: null } as unknown as VeDichConsole
        const cards = railCardsOf(input({ roundId: "ve-dich", veDich }))
        expect(cards.find((c) => c.id === "u2")?.buzzing).toBe(true)
        expect(cards.find((c) => c.id === "u1")?.buzzing).toBeUndefined()
    })

    it("marks nobody on khởi động — the batch has no single answerer", () => {
        const khoiDong = { questionIndex: 0, questionCount: 6, windowOpen: true } as KhoiDongConsole
        const cards = railCardsOf(input({ roundId: "khoi-dong", khoiDong }))
        expect(cards.every((c) => c.buzzing === undefined)).toBe(true)
    })

    it("marks nobody on a round whose buzz belongs to another mechanic", () => {
        // but-pha never wears the purple card, even with a stale buzzer in hand
        const khoiDong = { questionIndex: 0, questionCount: 6, windowOpen: true } as KhoiDongConsole
        const cards = railCardsOf(input({ roundId: "but-pha", khoiDong }))
        expect(cards.every((c) => c.buzzing === undefined)).toBe(true)
    })
})

describe("railCardsOf — badges belong to the round", () => {
    it("marks the keyword lock and dims the eliminated (giai-ma)", () => {
        const giaiMa = {
            players: [
                { id: "u1", keywordLocked: true, eliminated: false },
                { id: "u2", keywordLocked: false, eliminated: true },
            ],
        } as unknown as GiaiMaConsole
        const cards = railCardsOf(input({ roundId: "giai-ma", giaiMa }))
        expect(badgeOf(cards, "u1")).toBe("Giải mật mã")
        expect(cards.find((c) => c.id === "u1")?.dimmed).toBeUndefined()
        expect(badgeOf(cards, "u2")).toBeUndefined()
        expect(cards.find((c) => c.id === "u2")?.dimmed).toBe(true)
    })

    it("puts STAR on the answerer and ASSIGN on the handed-to player (ve-dich)", () => {
        const star = { power: "STAR", answererId: "u1", assignedToId: null } as unknown as VeDichConsole
        expect(badgeOf(railCardsOf(input({ roundId: "ve-dich", veDich: star })), "u1")).toBe("Ngôi sao")

        const assign = { power: "ASSIGN", answererId: "u1", assignedToId: "u2" } as unknown as VeDichConsole
        const cards = railCardsOf(input({ roundId: "ve-dich", veDich: assign }))
        expect(badgeOf(cards, "u2")).toBe("Được chỉ định")
        expect(badgeOf(cards, "u1")).toBeUndefined()
    })

    it("does not read a ve-dich badge on another round", () => {
        const veDich = { power: "STAR", answererId: "u1", assignedToId: null } as unknown as VeDichConsole
        const cards = railCardsOf(input({ roundId: "giai-ma", veDich }))
        expect(cards.every((c) => c.badge === undefined)).toBe(true)
    })
})
