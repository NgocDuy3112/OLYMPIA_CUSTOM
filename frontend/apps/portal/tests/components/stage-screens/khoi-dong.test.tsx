import { expect, it, describe } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { roundModuleOf } from "@/rounds"
import {
    expectButtonsInOrder,
    facts,
    renderRound,
} from "../../helpers/stage-facts"

describe("KhoiDongRieng — S1, the oral run", () => {
    it("lights nothing until a player is marked, even with a run in view", () => {
        renderRound("khoi-dong", {
            baseCards: [{ id: "u1", name: "An", points: 10 }, { id: "u2", name: "Bình", points: 5 }],
            oralRemaining: 30,
        }, {
            oral: { questionId: "q1", question: null, playerId: "u1", index: 0, total: 6, elapsedS: 10, budgetS: 45, deadlineAt: "2026-01-01T00:00:40.000Z" },
            selectedPlayerId: null,
        })

        expect(screen.queryByRole("button", { name: "Tính giờ" })).toBeNull()
        expect(screen.queryByRole("button", { name: "Đúng" })).toBeNull()
        expect(screen.queryByRole("button", { name: "Sai" })).toBeNull()
    })

    it("shows the stopwatch strip and sends the run's verdict", async () => {
        const user = userEvent.setup()
        const f = renderRound("khoi-dong", {
            baseCards: [{ id: "u1", name: "An", points: 10, ring: "selected" as const }],
            oralRemaining: 30,
        }, {
            oral: { questionId: "q1", question: null, playerId: "u1", index: 0, total: 6, elapsedS: 10, budgetS: 45, deadlineAt: "2026-01-01T00:00:40.000Z" },
            selectedPlayerId: "u1",
        })

        expect(screen.getByText("Tính giờ")).toBeInTheDocument()
        expectButtonsInOrder(["Đúng", "Sai", "Về sảnh"])
        await user.click(screen.getByRole("button", { name: "Đúng" }))
        expect(f.send).toHaveBeenCalledWith({ kind: "khoi-dong.recordOral", correct: true, spentS: 0, playerId: "u1" })
        await user.click(screen.getByRole("button", { name: "Về sảnh" }))
        expect(f.backToLobby).toHaveBeenCalledOnce()
    })

    it("Hết lượt is always offered and switches the run explicitly", async () => {
        const user = userEvent.setup()
        const f = renderRound("khoi-dong", {}, {
            oral: { questionId: "q1", question: null, playerId: "u1", index: 0, total: 6, elapsedS: 0, budgetS: 40, deadlineAt: null },
        })

        await user.click(screen.getByRole("button", { name: "Hết lượt" }))
        expect(f.send).toHaveBeenCalledWith({ kind: "khoi-dong.timeOutRun" })
    })

    it("after the sixth the QuestionCard is blank: no question text, no verdict buttons", () => {
        renderRound("khoi-dong", {}, { oral: null, selectedPlayerId: "u1" })

        expect(screen.queryByText(/Lượt đã xong/)).toBeNull()
        expect(screen.queryByText(/Chưa chọn người chơi/)).toBeNull()
        expect(screen.queryByRole("button", { name: "Đúng" })).toBeNull()
        expect(screen.getByText("Tính giờ")).toBeInTheDocument()
    })

    const oralRun = {
        oral: {
            questionId: "q1",
            question: {
                questionId: "q1",
                kind: "TEXT" as const,
                position: 1,
                questionText: "Câu hỏi miệng",
                media: null,
                payload: {},
            },
            playerId: "u1",
            index: 0,
            total: 6,
            elapsedS: 0,
            budgetS: 40,
            deadlineAt: null,
        },
    }

    it("the view's oral question rides on the QuestionCard — no local clock needed", () => {
        renderRound("khoi-dong", {}, oralRun)

        expect(screen.getByText("Câu hỏi miệng")).toBeInTheDocument()
    })

    it("the engine withholds the question — the match list does not leak it", () => {
        renderRound(
            "khoi-dong",
            { oralRemaining: 30 },
            {
                oral: { questionId: "q9", question: null, playerId: "u1", index: 0, total: 6, elapsedS: 0, budgetS: 40, deadlineAt: null },
            },
            null,
            [{
                _id: "q9",
                kind: "TEXT",
                roundId: "khoi-dong",
                turnId: "phase1",
                position: 1,
                questionText: "Câu hỏi từ danh sách",
                points: 10,
                payload: { acceptedAnswers: [] },
            }]
        )

        expect(screen.queryByText("Câu hỏi từ danh sách")).toBeNull()
    })

    it("Tính giờ tells the engine to reveal the question — only after a player is marked", async () => {
        const user = userEvent.setup()
        const f = renderRound("khoi-dong", {
            baseCards: [{ id: "u1", name: "An", points: 10, ring: "selected" as const }],
        }, { ...oralRun, selectedPlayerId: "u1" })

        await user.click(screen.getByRole("button", { name: "Tính giờ" }))

        expect(f.send).toHaveBeenCalledWith({ kind: "khoi-dong.startClock" })
    })

    it("a card click marks that player for the turn — setTurn only", async () => {
        const user = userEvent.setup()
        const f = renderRound("khoi-dong", {
            baseCards: [{ id: "u1", name: "An", points: 10 }, { id: "u2", name: "Bình", points: 5 }],
        }, {
            oral: { questionId: "q1", question: null, playerId: "u1", index: 0, total: 6, elapsedS: 10, budgetS: 45, deadlineAt: null },
        })

        await user.click(screen.getByText("Bình"))
        expect(f.send).toHaveBeenCalledWith({ kind: "khoi-dong.setTurn", playerId: "u2" })
    })

    it("a marked card decides who the verdict is scored against", async () => {
        const user = userEvent.setup()
        const f = renderRound("khoi-dong", {
            baseCards: [{ id: "u1", name: "An", points: 10 }, { id: "u2", name: "Bình", points: 5, ring: "selected" as const }],
            oralRemaining: 30,
        }, {
            oral: { questionId: "q1", question: null, playerId: "u2", index: 0, total: 6, elapsedS: 10, budgetS: 45, deadlineAt: "2026-01-01T00:00:40.000Z" },
            selectedPlayerId: "u2",
        })

        await user.click(screen.getByRole("button", { name: "Đúng" }))
        expect(f.send).toHaveBeenCalledWith({
            kind: "khoi-dong.recordOral", correct: true, spentS: 0, playerId: "u2",
        })
    })

    it("locks Đúng/Sai while no run is open, and once the budget is blown", () => {
        const mod = roundModuleOf("khoi-dong")!
        const { rerender } = render(mod.render(facts()))
        expect(screen.queryByRole("button", { name: "Đúng" })).toBeNull()
        expect(screen.getByRole("button", { name: "Về sảnh" })).toBeInTheDocument()

        rerender(mod.render(facts(
            { oralRemaining: 0 },
            { oral: { questionId: "q1", question: null, playerId: "u1", index: 2, total: 6, elapsedS: 40, budgetS: 45, deadlineAt: null } },
        )))
        expect(screen.queryByRole("button", { name: "Sai" })).toBeNull()
    })
})

describe("KhoiDongChung — S2, the timed batch", () => {
    const BUTTON = { selector: "button" } as const
    const q1 = { questionId: "q1", deadlineAt: null, question: null }
    const batch = (over: Record<string, unknown> = {}) => ({
        stage: "phase2",
        ended: false,
        phase2Begun: true,
        phase2Closed: false,
        questionIndex: 0,
        questionCount: 6,
        windowOpen: false,
        ...over,
    })

    it("Bấm giờ opens the window — and is inert while one runs", async () => {
        const user = userEvent.setup()
        const mod = roundModuleOf("khoi-dong")!
        const f = facts({ stage: "phase2" }, { open: [q1] }, batch())
        const { rerender } = render(mod.render(f))

        await user.click(screen.getByText("Bấm giờ", BUTTON))
        expect(f.send).toHaveBeenCalledWith({ kind: "khoi-dong.startWindow" })

        rerender(mod.render(facts(
            { stage: "phase2" },
            { open: [{ ...q1, deadlineAt: "2026-01-01T00:00:10.000Z" }] },
            batch({ windowOpen: true }),
        )))
        expect(screen.queryByText("Bấm giờ", BUTTON)).toBeNull()
    })

    it("marks the SELECTED card: Đúng/Sai send that player with the verdict", async () => {
        const user = userEvent.setup()
        const f = renderRound("khoi-dong", { stage: "phase2", target: "u2" }, { open: [q1] }, batch({ windowOpen: true }))

        await user.click(screen.getByText("Đúng", BUTTON))
        expect(f.sendChain).toHaveBeenCalledWith([
            { kind: "khoi-dong.judge", playerId: "u2", correct: true },
        ])

        await user.click(screen.getByText("Sai", BUTTON))
        expect(f.sendChain).toHaveBeenCalledWith([
            { kind: "khoi-dong.judge", playerId: "u2", correct: false },
        ])
    })

    it("has no chance labels left: one correct answer simply pays ten", () => {
        renderRound("khoi-dong", { stage: "phase2", target: "u1" }, { open: [q1] }, batch({ windowOpen: true }))
        expect(screen.getByText("Đúng", BUTTON)).toBeInTheDocument()
        expect(screen.queryByText(/×10/)).toBeNull()
        expect(screen.queryByText(/×5/)).toBeNull()
    })

    it("nothing to mark without a target — the buttons stay inert", () => {
        renderRound("khoi-dong", { stage: "phase2", target: null }, { open: [q1] }, batch({ windowOpen: true }))
        expect(screen.queryByText("Đúng", BUTTON)).toBeNull()
        expect(screen.queryByText("Sai", BUTTON)).toBeNull()
    })

    it("the NEXT number on the strip is the advance", async () => {
        const user = userEvent.setup()
        const f = renderRound("khoi-dong", { stage: "phase2" }, { open: [q1] }, batch({ questionIndex: 1 }))

        await user.click(screen.getByRole("button", { name: "3" }))
        expect(f.send).toHaveBeenCalledWith({ kind: "khoi-dong.nextQuestion" })

        expect(screen.queryByRole("button", { name: "1" })).toBeNull()
        await user.click(screen.getByText("1"))
        expect(f.send).toHaveBeenCalledTimes(1)
    })

    it("Đáp án thí sinh reveals the question in play — inert with nothing on screen", async () => {
        const user = userEvent.setup()
        const mod = roundModuleOf("khoi-dong")!
        const f = facts({ stage: "phase2" }, { open: [q1] }, batch())
        const { rerender } = render(mod.render(f))

        await user.click(screen.getByRole("button", { name: "Đáp án thí sinh" }))
        expect(f.send).toHaveBeenCalledWith({ kind: "reveal.answer", questionId: "q1" })

        rerender(mod.render(facts({ stage: "phase2" }, { open: [] }, batch())))
        expect(screen.queryByRole("button", { name: "Đáp án thí sinh" })).toBeNull()
    })
})
