// @vitest-environment jsdom
import { render } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { PlayerCtx, PlayerView } from "@shared/deck/types"
import { GiaiMaAOCPlayer } from "@shared/deck/screens/GiaiMaAOCPlayer"
import { ButPhaAOCPlayer } from "@shared/deck/screens/ButPhaAOCPlayer"
import { KhoiDongChungAOCPlayer } from "@shared/deck/screens/KhoiDongChungAOCPlayer"
import { KhoiDongRiengAOCPlayer } from "@shared/deck/screens/KhoiDongRiengAOCPlayer"
import { VeDichChungAOCPlayer } from "@shared/deck/screens/VeDichChungAOCPlayer"
import { VeDichPickAOCPlayer } from "@shared/deck/screens/VeDichPickAOCPlayer"
import { VeDichRiengAOCPlayer } from "@shared/deck/screens/VeDichRiengAOCPlayer"

// A smoke test per player screen: the deck is PURE (ctx in, JSX out), so each
// screen must render from a plain fixture with no provider, no socket and no
// camera. This is what catches the refactor class of bug — a screen that starts
// depending on something the orchestrator no longer hands it.

const question = (id: string, kind: "CHOICE" | "TEXT" | "KEYWORD" = "TEXT") => ({
    questionId: id,
    kind,
    position: 1,
    questionText: `Câu hỏi ${id}`,
    media: null,
    timeLimit: 30,
    payload: kind === "CHOICE" ? { options: [{ id: "a", text: "A" }, { id: "b", text: "B" }] } : {},
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
        kind: "CHOICE" as const,
        position: 1,
        questionText: "Câu hỏi mở",
        media: null,
        timeLimit: 30,
        payload: { options: [{ id: "a", text: "A" }, { id: "b", text: "B" }] },
    },
}

describe("player screens render from a plain fixture", () => {
    it("khởi động · lượt chung — no window yet: the field waits for Bấm giờ", () => {
        const open = view({ roundId: "khoi-dong", open: [openQ] })
        const { getByText, queryByLabelText } = render(
            <KhoiDongChungAOCPlayer ctx={ctx({ v: open, remaining: 0 })} />
        )
        expect(getByText(/Chờ điều hành bấm giờ/)).toBeTruthy()
        expect(queryByLabelText("Câu trả lời của bạn")).toBeNull()
    })

    // a REAL text question: AnswerBand draws the input for one, and nothing for
    // the bare { question: null } fixture above
    const windowLive = () =>
        view({
            roundId: "khoi-dong",
            open: [{ questionId: "q1", deadlineAt: null, question: question("q1") }],
            me: { windowOpen: true, questionIndex: 0, questionCount: 6 } as PlayerView["me"],
        })

    it("khởi động · lượt chung — the field opens with the window", () => {
        const { getByLabelText, getByText } = render(
            <KhoiDongChungAOCPlayer ctx={ctx({ v: windowLive(), remaining: 8_000 })} />
        )
        expect(getByLabelText("Câu trả lời của bạn")).not.toBeDisabled()
        expect(getByText(/còn 0:08/)).toBeTruthy()
    })

    it("khởi động · lượt chung — and LOCKS the moment the clock hits zero", () => {
        // greyed in place, not removed: the player SEES the window ended
        const { getByLabelText } = render(
            <KhoiDongChungAOCPlayer ctx={ctx({ v: windowLive(), remaining: 0 })} />
        )
        expect(getByLabelText("Câu trả lời của bạn")).toBeDisabled()
    })

    it("Hiện đáp án — the revealed answer rides under the question", () => {
        const v = view({
            roundId: "khoi-dong",
            open: [openQ],
            revealed: { questionId: "q1", answer: "Hà Nội" },
        })
        const { getByText } = render(<KhoiDongChungAOCPlayer ctx={ctx({ v, remaining: 0 })} />)
        expect(getByText("Đáp án")).toBeTruthy()
        expect(getByText("Hà Nội")).toBeTruthy()
    })

    it("Hiện đáp án — nothing revealed means no banner", () => {
        const v = view({ roundId: "khoi-dong", open: [openQ] })
        const { queryByText } = render(<KhoiDongChungAOCPlayer ctx={ctx({ v, remaining: 0 })} />)
        expect(queryByText("Đáp án")).toBeNull()
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

    it("giải mã — Hiện đáp án puts the revealed answer on the card", () => {
        const v = view({
            roundId: "giai-ma",
            keyword: { questionId: "kw", question: null },
            revealed: { questionId: "kw", answer: "CHUNGKET" },
        })
        const { getByText } = render(<GiaiMaAOCPlayer ctx={ctx({ v })} />)
        expect(getByText("Đáp án")).toBeTruthy()
        expect(getByText("CHUNGKET")).toBeTruthy()
    })

    it("về đích · câu hỏi chung — the typed band", () => {
        const v = view({ roundId: "ve-dich", stage: "phase1", open: [openQ] })
        const { getByText } = render(<VeDichChungAOCPlayer ctx={ctx({ v })} />)
        expect(getByText("Về đích")).toBeTruthy()
    })

    it("về đích · lượt cá nhân — the buzz button is this player's", () => {
        const v = view({ roundId: "ve-dich", stage: "phase2", open: [openQ], me: { canBuzz: true, buzzWindowOpen: true } as PlayerView["me"] })
        const { getAllByText } = render(<VeDichRiengAOCPlayer ctx={ctx({ v })} />)
        expect(getAllByText("Bấm chuông").length).toBeGreaterThan(0)
    })

    it("về đích · the board — a picker with the fixed bands", () => {
        const v = view({ roundId: "ve-dich", stage: "phase2", me: { isMyTurn: true } })
        const { getAllByText, getByTitle } = render(<VeDichPickAOCPlayer ctx={ctx({ v })} />)
        // the badge, and the mode line under it — both say the round's name
        expect(getAllByText("Về đích").length).toBeGreaterThan(0)
        expect(getByTitle("đã dùng")).toBeTruthy()
    })
})
