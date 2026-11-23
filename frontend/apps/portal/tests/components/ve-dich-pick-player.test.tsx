import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { VeDichChungPickAOCPlayer } from "@shared/deck/screens/VeDichChungPickAOCPlayer"
import type { PlayerView } from "@shared/deck/types"

function view(over: Partial<PlayerView> = {}): PlayerView {
    return {
        matchId: "m1",
        roundId: "ve-dich",
        version: 1,
        stage: "phase1",
        open: [],
        table: [
            { id: "u1", displayName: "An", points: 0, rank: 1 },
            { id: "u2", displayName: "Bình", points: 0, rank: 2 },
        ],
        board: [
            { questionId: "q20a", value: 20, where: "pending" },
            { questionId: "q20b", value: 20, where: "free" },
            { questionId: "q30a", value: 30, where: "pending" },
            { questionId: "q30b", value: 30, where: "free" },
        ],
        me: { pickedTiles: [], hintVerdicts: {}, pendingPicks: ["q20a", "q30a"] },
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
    pickS2: () => {},
    answerBusy: false,
    submitAnswer: () => {},
    keywordBusy: false,
    submitKeyword: () => {},
    cmdBusy: false,
    command: () => {},
})

describe("VeDichChungPickAOCPlayer — staged picks", () => {
    it("shows one chip per picked question, carrying its value", () => {
        render(<VeDichChungPickAOCPlayer ctx={ctx(view())} />)

        const chips = screen.getAllByRole("button").filter((el) => {
            const title = el.getAttribute("title") ?? ""
            return title.startsWith("Đã chọn câu ")
        })
        const values = chips.map((el) => el.textContent)
        expect(values.filter((v) => v === "20")).toHaveLength(1)
        expect(values.filter((v) => v === "30")).toHaveLength(1)
    })

    it("renders no chips while nothing has been picked yet", () => {
        render(<VeDichChungPickAOCPlayer ctx={ctx(view({ me: { pickedTiles: [], hintVerdicts: {}, pendingPicks: [] } }))} />)

        const disabled = screen.getAllByRole("button").filter(
            (el) => el.getAttribute("aria-disabled") === "true"
        )
        expect(disabled).toHaveLength(0)
    })
})
