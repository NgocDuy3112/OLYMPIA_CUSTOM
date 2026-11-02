// @vitest-environment jsdom
import { render } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { PlayerCtx, PlayerView } from "@shared/deck/types"
import { GiaiMaAOCPlayer } from "@/rounds/giai-ma/GiaiMaAOCPlayer"
import { ButPhaAOCPlayer } from "@/rounds/but-pha/ButPhaAOCPlayer"
import { KhoiDongChungAOCPlayer } from "@/rounds/khoi-dong/KhoiDongChungAOCPlayer"
import { KhoiDongRiengAOCPlayer } from "@/rounds/khoi-dong/KhoiDongRiengAOCPlayer"
import { VeDichChungAOCPlayer } from "@/rounds/ve-dich/VeDichChungAOCPlayer"
import { VeDichPickAOCPlayer } from "@/rounds/ve-dich/VeDichPickAOCPlayer"
import { VeDichRiengAOCPlayer } from "@/rounds/ve-dich/VeDichRiengAOCPlayer"

// A smoke test per player screen: the deck is PURE (ctx in, JSX out), so each
// screen must render from a plain fixture with no provider, no socket and no
// camera. This is what catches the refactor class of bug — a screen that starts
// depending on something the orchestrator no longer hands it.

const question = (id: string, kind: "MC" | "TEXT" | "KEYWORD" = "TEXT") => ({
    questionId: id,
    kind,
    position: 1,
    questionText: `Câu hỏi ${id}`,
    media: null,
    timeLimit: 30,
    payload: kind === "MC" ? { options: [{ id: "a", text: "A" }, { id: "b", text: "B" }] } : {},
})

const board = [
    { questionId: "q20", value: 20, where: "free" as const },
    { questionId: "q30", value: 30, where: "free" as const },
    { questionId: "q40", value: 40, where: "taken" as const },
    { questionId: "q50", value: 50, where: "deferred" as const },
]

function view(over: Partial<PlayerView> = {}): PlayerView {
    return {
        matchId: "m1",
        roundId: "khoi-dong",
        version: 1,
        stage: "phase2",
        open: [],
        table: [
            { id: "u1", displayName: "An", points: 30, rank: 1 },
            { id: "u2", displayName: "Bình", points: 20, rank: 2 },
        ],
        board,
        me: {},
        ...over,
    }
}

function ctx(over: Partial<PlayerCtx> = {}): PlayerCtx {
    const v = over.v ?? view()
    return {
        v,
        stage: v.stage,
        open: v.open,
        remaining: 12,
        myId: "u1",
        flash: null,
        nameOf: (id) => (id === "u1" ? "An" : "Bình"),
        s2Q: v.open[0],
        s2Idx: 0,
        pickS2: vi.fn(),
        pickedCells: [],
        setPickedCells: vi.fn(),
        answerBusy: false,
        submitAnswer: vi.fn(),
        keywordBusy: false,
        submitKeyword: vi.fn(),
        cmdBusy: false,
        command: vi.fn(),
        ...over,
    }
}

const openQ = {
    questionId: "q1",
    deadlineAt: null,
    question: {
        questionId: "q1",
        kind: "MC" as const,
        position: 1,
        questionText: "Câu hỏi mở",
        media: null,
        timeLimit: 30,
        payload: { options: [{ id: "a", text: "A" }, { id: "b", text: "B" }] },
    },
}

describe("player screens render from a plain fixture", () => {
    it("khởi động · lượt chung — the squares and the answer band", () => {
        const v = view({ roundId: "khoi-dong", open: [openQ, { ...openQ, questionId: "q2" }] })
        const { getByText, getAllByRole } = render(<KhoiDongChungAOCPlayer ctx={ctx({ v })} />)
        expect(getByText("Khởi động")).toBeTruthy()
        // one option per MC choice + Gửi
        expect(getAllByRole("button").length).toBeGreaterThanOrEqual(3)
    })

    it("khởi động · lượt cá nhân — the run pill names who is playing", () => {
        const v = view({
            roundId: "khoi-dong",
            stage: "phase1",
            oral: { questionId: "q1", question: question("q1"), playerId: "u2", index: 0, total: 6, elapsedS: 5, budgetS: 20 },
        })
        const { getByText } = render(<KhoiDongRiengAOCPlayer ctx={ctx({ v })} />)
        expect(getByText("Đang thi: Bình")).toBeTruthy()
    })

    it("bứt phá — no open question still renders the card", () => {
        const { getByText } = render(<ButPhaAOCPlayer ctx={ctx({ v: view({ roundId: "but-pha" }) })} />)
        expect(getByText("Bứt phá")).toBeTruthy()
    })

    it("giải mã — the keyword banner and the eight tiles", () => {
        const v = view({
            roundId: "giai-ma",
            keyword: { questionId: "k1", question: { ...question("k1", "KEYWORD"), payload: { codeLength: 7 } } },
        })
        const { getByText } = render(<GiaiMaAOCPlayer ctx={ctx({ v })} />)
        expect(getByText(/Mật mã gồm có 7 chữ cái/)).toBeTruthy()
        expect(getByText("Giải mã")).toBeTruthy()
    })

    it("về đích · câu hỏi chung — the typed band", () => {
        const v = view({ roundId: "ve-dich", stage: "phase1", open: [openQ] })
        const { getByText } = render(<VeDichChungAOCPlayer ctx={ctx({ v })} />)
        expect(getByText("Về đích")).toBeTruthy()
    })

    it("về đích · lượt cá nhân — the buzz button is this player's", () => {
        const v = view({ roundId: "ve-dich", stage: "phase2", open: [openQ], me: { canBuzz: true, buzzWindowOpen: true } as PlayerView["me"] })
        const { getByText } = render(<VeDichRiengAOCPlayer ctx={ctx({ v })} />)
        expect(getByText("Bấm chuông")).toBeTruthy()
    })

    it("về đích · the board — a picker with the fixed bands", () => {
        const v = view({ roundId: "ve-dich", stage: "phase2", me: { isMyTurn: true } })
        const { getAllByText, getByTitle } = render(<VeDichPickAOCPlayer ctx={ctx({ v })} />)
        // the badge, and the mode line under it — both say the round's name
        expect(getAllByText("Về đích").length).toBeGreaterThan(0)
        expect(getByTitle("đã dùng")).toBeTruthy()
    })
})
