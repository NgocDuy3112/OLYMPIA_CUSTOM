import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { VeDichChungPickPlayer } from "@shared/deck/screens/VeDichChungPickPlayer"
import { VeDichRiengPickPlayer } from "@shared/deck/screens/VeDichRiengPickPlayer"
import type { PlayerView } from "@shared/deck/types"

function view(over: Partial<PlayerView> = {}): PlayerView {
    return {
        matchId: "m1",
        roundId: "ve-dich",
        version: 1,
        stage: "phase2",
        open: [],
        table: [
            { id: "u1", displayName: "An", points: 0, rank: 1 },
            { id: "u2", displayName: "Bình", points: 0, rank: 2 },
        ],
        board: [
            { questionId: "a", value: 40, where: "pending" },
            { questionId: "b", value: 40, where: "pending" },
            { questionId: "c", value: 40, where: "free" },
        ],
        me: { pickedTiles: [], hintVerdicts: {}, pendingPicks: ["a", "b"] },
        ...over,
    } as PlayerView
}

const ctx = (v: PlayerView) => ({
    v,
    stage: v.stage,
    open: v.open,
    remaining: 0,
    oralRemaining: 0,
    clock: { sync: () => {}, skew: () => 0 },
    myId: "u1",
    flash: null,
    nameOf: (id: string) => id,
    s2Q: null,
    s2Idx: 0,
    pickS2: vi.fn(),
    answerBusy: false,
    submitAnswer: vi.fn(),
    keywordBusy: false,
    submitKeyword: vi.fn(),
    cmdBusy: false,
    command: vi.fn(),
})

const chungView = (): PlayerView => view({
    stage: "phase1",
    board: [
        { questionId: "a", value: 20, where: "pending" },
        { questionId: "b", value: 30, where: "pending" },
        { questionId: "c", value: 20, where: "free" },
    ],
    me: { pickedTiles: [], hintVerdicts: {}, pendingPicks: ["a", "b"] },
})

describe("VeDich pick players — staged picks from the server", () => {
    it("chung: shows a chip for every staged pick", () => {
        render(<VeDichChungPickPlayer ctx={ctx(chungView())} />)
        expect(screen.getAllByTitle(/Đã chọn câu /)).toHaveLength(2)
    })

    it("rieng: shows a chip for every staged pick", () => {
        render(<VeDichRiengPickPlayer ctx={ctx(view())} />)
        expect(screen.getAllByTitle(/Câu 40 điểm đã được chọn/)).toHaveLength(2)
    })

    it("rieng: the remaining count drops as picks are staged", () => {
        render(<VeDichRiengPickPlayer ctx={ctx(view())} />)
        expect(screen.getByText("còn 1")).toBeInTheDocument()
    })
})
