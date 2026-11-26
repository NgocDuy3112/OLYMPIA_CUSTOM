import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { PlayerCtx, PlayerView } from "@shared/deck/types"
import { VeDichChungAOCPlayer } from "@shared/deck/screens/VeDichChungAOCPlayer"
import { VeDichRiengAOCPlayer } from "@shared/deck/screens/VeDichRiengAOCPlayer"
import { veDichAOC } from "@/rounds/ve-dich/logic"

function view(over: Partial<PlayerView> = {}): PlayerView {
    return {
        matchId: "m1",
        roundId: "ve-dich",
        version: 1,
        stage: "phase1",
        open: [],
        table: [
            { id: "u1", displayName: "An", points: 30, rank: 1 },
            { id: "u2", displayName: "Bình", points: 20, rank: 2 },
        ],
        board: [],
        me: { pickedTiles: [], hintVerdicts: {} },
        hintAnswers: {},
        keywordDeadlineAt: null,
        keywordLength: 0,
        keywordKind: "letters",
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
        oralRemaining: 12,
        clock: { sync: () => {}, skew: () => 0 },
        myId: "u1",
        flash: null,
        nameOf: (id) => (id === "u1" ? "An" : "Bình"),
        s2Q: v.open[0],
        s2Idx: 0,
        pickS2: vi.fn(),
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
        kind: "TEXT" as const,
        position: 1,
        questionText: "Câu hỏi mở",
        media: null,
        payload: {},
    },
}

/**
 * Regression for review C1: a ve-dich view without an open question used to
 * dereference `open[0]` and take the whole screen down (no ErrorBoundary).
 */
describe("ve-dich screens survive an empty open[]", () => {
    it("chung screen renders instead of throwing", () => {
        expect(() => render(<VeDichChungAOCPlayer ctx={ctx()} />)).not.toThrow()
    })

    it("rieng screen renders instead of throwing", () => {
        expect(() => render(<VeDichRiengAOCPlayer ctx={ctx()} />)).not.toThrow()
    })

    it("the round module never routes an empty-open phase2 view into the buzz screen", () => {
        const empty = ctx({ v: view({ stage: "phase2", open: [] }) })
        expect(() => render(<>{veDichAOC.render(empty)}</>)).not.toThrow()
    })

    it("still paints the question and the answer band when one is open", () => {
        const open = ctx({ v: view({ open: [openQ] }) })
        render(<VeDichChungAOCPlayer ctx={open} />)
        expect(screen.getByText("Câu hỏi mở")).toBeInTheDocument()
        expect(screen.getByLabelText("Câu trả lời của bạn")).toBeInTheDocument()
    })
})

/**
 * Regression: after the controller confirms the round's picks, the console
 * moves to the chung screen — but the players stayed on the pick board until a
 * chip happened to open a question.
 */
describe("ve-dich dispatch follows picksConfirmed, not just open[]", () => {
    it("phase 1 with confirmed picks leaves the pick board even before a chip is clicked", () => {
        const confirmed = ctx({
            v: view({
                open: [],
                board: [{ questionId: "q1", value: 20, where: "pending" }],
                console: { picksConfirmed: true },
            }),
        })
        render(<>{veDichAOC.render(confirmed)}</>)
        // The pick board is gone — its grid is what the pick screen paints.
        expect(screen.queryByTitle("Câu 20 điểm đã chọn — chờ xác nhận")).toBeNull()
        expect(document.querySelector('[style*="grid-template-columns"]')).toBeNull()
        expect(screen.getByText("Lượt chung")).toBeInTheDocument()
    })

    it("phase 1 without confirmed picks still shows the pick board", () => {
        const picking = ctx({
            v: view({
                open: [],
                board: [{ questionId: "q1", value: 20, where: "free" }],
                console: { picksConfirmed: false },
            }),
        })
        render(<>{veDichAOC.render(picking)}</>)
        expect(screen.getByTitle("Câu 20 điểm còn trống")).toBeInTheDocument()
    })

    it("keeps the pick board for staged picks when the frame carries no console block", () => {
        const old = ctx({
            v: view({
                open: [],
                board: [{ questionId: "q1", value: 20, where: "pending" }],
                console: null,
            }),
        })
        render(<>{veDichAOC.render(old)}</>)
        // rules.md §7.3: staged (`pending`) picks stay on the board and can still
        // be dropped — only console `Xác nhận` moves the room to the play screen.
        // A frame without a console block therefore reads as "not confirmed".
        expect(document.querySelector('[style*="grid-template-columns"]')).not.toBeNull()
        // Staged, not played: the board must not claim the question is used.
        expect(screen.getByTitle("Câu 20 điểm đã chọn — chờ xác nhận")).toBeInTheDocument()
        expect(screen.queryByTitle("Câu 20 điểm đã dùng")).toBeNull()
        expect(screen.getByText("Lượt chung")).toBeInTheDocument()
    })
})

/**
 * Regression: phase 2 read `picksConfirmed` as "back to the shared board".
 * Once the rieng board is confirmed the console moves to the rieng play screen
 * (portal/src/rounds/ve-dich/logic.tsx:55-58) and never returns to the picker
 * (rules.md §7.4) — the player waited on the chung screen instead.
 */
describe("ve-dich phase 2 waits on the rieng screen once the picks are confirmed", () => {
    const confirmedPhase2 = { picksConfirmed: true, turnQuestions: ["q1", "q2", "q3"], turnValues: [40, 50, 20] }

    it("leaves the pick board for the rieng screen before the first question opens", () => {
        const waiting = ctx({
            v: view({
                stage: "phase2",
                open: [],
                board: [
                    { questionId: "q1", value: 40, where: "pending" },
                    { questionId: "q2", value: 50, where: "pending" },
                    { questionId: "q3", value: 20, where: "pending" },
                ],
                console: confirmedPhase2,
            }),
        })
        render(<>{veDichAOC.render(waiting)}</>)

        expect(screen.queryByTitle("Câu 40 điểm đã chọn — chờ xác nhận")).toBeNull()
        expect(document.querySelector('[style*="grid-template-columns"]')).toBeNull()
        expect(screen.getByText("Lượt cá nhân")).toBeInTheDocument()
        // The turn's questions are still on screen while the room waits.
        // The deck describes the turn's questions; "Mở câu" is the console's command.
        expect(screen.getByTitle("Câu 40 điểm — chưa mở")).toBeInTheDocument()
        expect(screen.getByTitle("Câu 50 điểm — chưa mở")).toBeInTheDocument()
    })

    it("phase 2 without the confirmation is still the pick board", () => {
        const picking = ctx({
            v: view({
                stage: "phase2",
                open: [],
                board: [{ questionId: "q1", value: 40, where: "free" }],
                console: { picksConfirmed: false },
            }),
        })
        render(<>{veDichAOC.render(picking)}</>)
        expect(screen.getByTitle("Câu 40 điểm còn trống")).toBeInTheDocument()
    })
})
