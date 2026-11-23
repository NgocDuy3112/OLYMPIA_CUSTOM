import { describe, expect, it, vi } from "vitest"
import { railCardsOf, type RailCardsInput } from "@/console/lib/rail-cards"
import type { GiaiMaConsole, KhoiDongConsole, QuestionAnswerRow, VeDichConsole } from "@/lib/live"
import type { PeerControls } from "@shared/lib/rtc"


const TABLE = [
    { id: "u1", displayName: "An", points: 10, rank: 1 },
    { id: "u2", displayName: "Bình", points: 20, rank: 2 },
]

function row(over: Partial<QuestionAnswerRow> = {}): QuestionAnswerRow {
    return {
        userId: "u1",
        questionId: "q1",
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
        peerControls: new Map(),
        giaiMa: null,
        veDich: null,
        khoiDong: null,
        ...over,
    }
}

const ringOf = (cards: ReturnType<typeof railCardsOf>, id: string) =>
    cards.find((c) => c.id === id)?.ring
const badgeOf = (cards: ReturnType<typeof railCardsOf>, id: string) =>
    cards.find((c) => c.id === id)?.badge?.text
const iconOf = (cards: ReturnType<typeof railCardsOf>, id: string) =>
    cards.find((c) => c.id === id)?.icon

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

    it("lights only the player the controller picked, never the turn's first seat", () => {
        const cards = railCardsOf(input({
            roundId: "ve-dich",
            resolvingId: "q1",
            target: "u2",
            veDich: { phase: 2, turnPlayerId: "u1" } as never,
        }))
        expect(ringOf(cards, "u2")).toBe("selected")
        expect(ringOf(cards, "u1")).toBeUndefined()
    })
})

describe("railCardsOf — the answers rail", () => {
    it("leaves the bottom lines off a compact rail", () => {
        const cards = railCardsOf(input({ rows: [row()], railVariant: "compact", railQ: "q1", judgingId: "q1" }))
        expect(cards[0].answer).toBeUndefined()
        expect(cards[0].value).toBeUndefined()
    })

    it("shows the answer text and the answer time — never a separate points label", () => {
        const cards = railCardsOf(input({
            rows: [row({ pointsAwarded: 15, verdict: "INCORRECT", answeredMs: 3261 })],
            railVariant: "answers",
            railQ: "q1",
            judgingId: "q1",
        }))
        expect(cards[0].answer).toBe("một đáp án")
        expect(cards[0].value).toBeUndefined()
        expect(cards[0].answeredMs).toBe(3261)
    })

    it("keeps the answer text while the verdict is still open", () => {
        const pending = railCardsOf(input({
            rows: [row({ verdict: null })], railVariant: "answers", railQ: "q1", judgingId: "q1",
        }))
        expect(pending[0].answer).toBe("một đáp án")
        expect(pending[0].value).toBeUndefined()
    })

    it("shows an em dash for a player who did not answer", () => {
        const cards = railCardsOf(input({ railVariant: "answers", railQ: "q1", judgingId: "q1" }))
        expect(cards.map((c) => c.answer)).toEqual(["—", "—"])
        expect(cards.map((c) => c.value)).toEqual([undefined, undefined])
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
        const khoiDong = { questionIndex: 0, questionCount: 6, windowOpen: true } as KhoiDongConsole
        const cards = railCardsOf(input({ roundId: "but-pha", khoiDong }))
        expect(cards.every((c) => c.buzzing === undefined)).toBe(true)
    })
})

describe("railCardsOf — badges belong to the round", () => {
    it("shows the player's keyword answer on the badge once locked (giai-ma)", () => {
        const giaiMa = {
            players: [
                { id: "u1", keywordLocked: true, eliminated: false },
                { id: "u2", keywordLocked: false, eliminated: true },
            ],
        } as unknown as GiaiMaConsole
        const cards = railCardsOf(input({
            roundId: "giai-ma",
            giaiMa,
            keywordQuestionId: "k1",
            rows: [row({ questionId: "k1", userId: "u1", value: { text: "MƯA" } })],
        }))
        expect(badgeOf(cards, "u1")).toBe("MƯA")
        expect(cards.find((c) => c.id === "u1")?.answer).toBe("MƯA")
        expect(cards.find((c) => c.id === "u1")?.dimmed).toBeUndefined()
        expect(badgeOf(cards, "u2")).toBeUndefined()
        expect(cards.find((c) => c.id === "u2")?.dimmed).toBe(true)
    })

    it("puts the star on the answerer and swords on both halves (ve-dich)", () => {
        const star = { power: "STAR", answererId: "u1", assignedToId: null } as unknown as VeDichConsole
        expect(iconOf(railCardsOf(input({ roundId: "ve-dich", veDich: star })), "u1")).toBe("star")

        const assign = { power: "ASSIGN", answererId: "u1", assignedToId: "u2" } as unknown as VeDichConsole
        const cards = railCardsOf(input({ roundId: "ve-dich", veDich: assign }))
        expect(iconOf(cards, "u1")).toBe("swords")
        expect(iconOf(cards, "u2")).toBe("swords")
    })

    it("a staged power marks only the turn player (ve-dich)", () => {
        const veDich = {
            power: null, answererId: null, assignedToId: null,
            turnPlayerId: "u2", stagedPower: { power: "ASSIGN", targetId: "u1" },
        } as unknown as VeDichConsole
        const cards = railCardsOf(input({ roundId: "ve-dich", veDich }))
        expect(iconOf(cards, "u2")).toBe("swords")
        expect(iconOf(cards, "u1")).toBeUndefined()
    })

    it("does not read a ve-dich icon on another round", () => {
        const veDich = { power: "STAR", answererId: "u1", assignedToId: null } as unknown as VeDichConsole
        const cards = railCardsOf(input({ roundId: "giai-ma", veDich }))
        expect(cards.every((c) => c.icon === undefined)).toBe(true)
    })
})

describe("railCardsOf — peer controls per player", () => {
    const controlsFor = (over: Partial<PeerControls> = {}) => {
        const togglePlayerAudio = vi.fn()
        const togglePlayerVideo = vi.fn()
        const togglePlayerMic = vi.fn()
        const togglePlayerCam = vi.fn()
        const controls = {
            isMicOn: true,
            isAudioMuted: false,
            isVideoHidden: false,
            togglePlayerAudio,
            togglePlayerVideo,
            togglePlayerMic,
            togglePlayerCam,
            ...over,
        }
        return { controls, togglePlayerAudio, togglePlayerVideo, togglePlayerMic }
    }

    it("copies mic and mute state onto the matching card only", () => {
        const u1 = controlsFor({ isMicOn: false, isAudioMuted: true })
        const u2 = controlsFor({ isMicOn: true, isAudioMuted: false })
        const cards = railCardsOf(input({
            peerControls: new Map([
                ["u1", u1.controls],
                ["u2", u2.controls],
            ]),
        }))

        const an = cards.find((c) => c.id === "u1")
        const binh = cards.find((c) => c.id === "u2")
        expect(an?.micOn).toBe(false)
        expect(an?.audioMuted).toBe(true)
        expect(binh?.micOn).toBe(true)
        expect(binh?.audioMuted).toBe(false)
    })

    it("routes each toggle to the player it belongs to", () => {
        const u1 = controlsFor()
        const cards = railCardsOf(input({
            peerControls: new Map([["u1", u1.controls]]),
        }))
        cards.find((c) => c.id === "u1")?.onToggleAudio?.()
        cards.find((c) => c.id === "u1")?.onToggleVideo?.()
        expect(u1.togglePlayerAudio).toHaveBeenCalledWith("u1")
        expect(u1.togglePlayerVideo).toHaveBeenCalledWith("u1")
    })

    it("routes the mic command to the player it belongs to", () => {
        const u1 = controlsFor()
        const cards = railCardsOf(input({
            peerControls: new Map([["u1", u1.controls]]),
        }))
        cards.find((c) => c.id === "u1")?.onToggleMic?.()
        expect(u1.togglePlayerMic).toHaveBeenCalledWith("u1")
        expect(u1.togglePlayerAudio).not.toHaveBeenCalled()
        expect(u1.togglePlayerVideo).not.toHaveBeenCalled()
    })

    it("leaves a card without controls bare so the widget stays hidden", () => {
        const cards = railCardsOf(input({ peerControls: new Map() }))
        const an = cards.find((c) => c.id === "u1")
        expect(an?.onToggleAudio).toBeUndefined()
        expect(an?.onToggleVideo).toBeUndefined()
    })

    it("still carries controls when the player has no track at all — the muted-everything case", () => {
        const silent = controlsFor({ isMicOn: false, isAudioMuted: false, isVideoHidden: false })
        const cards = railCardsOf(input({
            peerControls: new Map([["u1", silent.controls]]),
        }))
        const an = cards.find((c) => c.id === "u1")
        expect(an?.micOn).toBe(false)
        expect(typeof an?.onToggleAudio).toBe("function")
    })
})
