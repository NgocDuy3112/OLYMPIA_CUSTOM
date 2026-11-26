import { expect, it, describe, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { roundModuleOf } from "@/rounds"
import {
    TWO_PLAYERS,
    THREE_PLAYERS,
    expectButtonsInOrder,
    facts,
    renderRound,
    veDichMc,
} from "../../helpers/stage-facts"

describe("VeDichPick — S5/S6, the board", () => {
    const veQuestion = (id: string, points: number) => ({
        _id: id,
        roundId: "ve-dich",
        turnId: "phase-1",
        position: 1,
        kind: "TEXT" as const,
        questionText: `Câu ${id}`,
        points,
        payload: { acceptedAnswers: [] },
    })
    const freeCell = (id: string, value: number) => ({ questionId: id, value, where: "free" as const })

    it("phase 1: clicking a board cell stages that cell, clicking it again drops it", async () => {
        const user = userEvent.setup()
        const f = renderRound(
            "ve-dich",
            {},
            { open: [], board: [freeCell("q30", 30), freeCell("q20", 20)], table: TWO_PLAYERS },
            veDichMc({ phase: 1, turnPlayerId: "u1" }),
            [veQuestion("q30", 30), veQuestion("q20", 20)],
        )

        await user.click(screen.getByTitle("Chọn câu 20 điểm"))
        expect(f.send).toHaveBeenCalledWith({
            kind: "ve-dich.pickRound",
            questionIds: ["q20"],
        })
        await user.click(screen.getByTitle("Chọn câu 30 điểm"))
        expect(f.send).toHaveBeenLastCalledWith({
            kind: "ve-dich.pickRound",
            questionIds: ["q20", "q30"],
        })
    })

    it("phase 1: shows a chip for every pick the server already staged", () => {
        renderRound(
            "ve-dich",
            {},
            {
                open: [],
                board: [
                    { questionId: "q20", value: 20, where: "pending" as const },
                    { questionId: "q30", value: 30, where: "pending" as const },
                ],
                table: TWO_PLAYERS,
            },
            veDichMc({ phase: 1, turnPlayerId: "u1" }),
            [veQuestion("q20", 20), veQuestion("q30", 30)],
        )

        const html = document.body.innerHTML
        expect(html).toContain("Bỏ câu 20 điểm")
    })

    it("phase 1: Xác nhận waits for the full N — one pick per player", async () => {
        const user = userEvent.setup()
        const mod = roundModuleOf("ve-dich")!
        const view = (pending: string[]) => facts(
            {},
            {
                open: [],
                board: [
                    { questionId: "a", value: 20, where: pending.includes("a") ? ("pending" as const) : ("free" as const) },
                    { questionId: "b", value: 30, where: pending.includes("b") ? ("pending" as const) : ("free" as const) },
                    { questionId: "c", value: 20, where: pending.includes("c") ? ("pending" as const) : ("free" as const) },
                ],
                table: THREE_PLAYERS,
            },
            veDichMc({ phase: 1, turnPlayerId: "u1" }),
            [veQuestion("a", 20), veQuestion("b", 30), veQuestion("c", 20)],
            "ve-dich",
        )
        const { rerender } = render(mod.render(view([])))

        await user.click(screen.getAllByTitle("Chọn câu 20 điểm")[0])
        rerender(mod.render(view(["a"])))
        expect(screen.queryByRole("button", { name: "Xác nhận" })).toBeNull()

        await user.click(screen.getByTitle("Chọn câu 30 điểm"))
        rerender(mod.render(view(["a", "b"])))
        expect(screen.queryByRole("button", { name: "Xác nhận" })).toBeNull()

        await user.click(screen.getByTitle("Chọn câu 20 điểm"))
        rerender(mod.render(view(["a", "b", "c"])))
        expect(screen.getByRole("button", { name: "Xác nhận" })).toBeInTheDocument()
    })

    it("phase 1: a local batch the server has not echoed does not arm Xác nhận", async () => {
        const user = userEvent.setup()
        const mod = roundModuleOf("ve-dich")!
        const view = (pending: string[]) => facts(
            {},
            {
                open: [],
                board: [
                    { questionId: "a", value: 20, where: pending.includes("a") ? ("pending" as const) : ("free" as const) },
                    { questionId: "b", value: 30, where: pending.includes("b") ? ("pending" as const) : ("free" as const) },
                ],
                table: TWO_PLAYERS,
            },
            veDichMc({ phase: 1, turnPlayerId: "u1" }),
            [veQuestion("a", 20), veQuestion("b", 30)],
            "ve-dich",
        )
        const { rerender } = render(mod.render(view(["a"])))

        await user.click(screen.getByTitle("Chọn câu 30 điểm"))
        expect(screen.queryByRole("button", { name: "Xác nhận" })).toBeNull()

        rerender(mod.render(view(["a", "b"])))
        expect(screen.getByRole("button", { name: "Xác nhận" })).toBeInTheDocument()
    })

    it("phase 2: each cell click writes the batch for the turn player", async () => {
        const user = userEvent.setup()
        const f = renderRound(
            "ve-dich",
            {},
            { open: [], selectedPlayerId: "u1", board: [freeCell("a", 40), freeCell("b", 40), freeCell("c", 40)] },
            veDichMc({ phase: 2, turnPlayerId: "u1" }),
            [veQuestion("a", 40), veQuestion("b", 40), veQuestion("c", 40)],
        )

        expect(screen.queryByRole("button", { name: "Chốt 3 câu" })).toBeNull()

        for (let index = 0; index < 3; index++) {
            await user.click(screen.getAllByTitle("Chọn câu 40 điểm")[0])
        }
        const call = (f.send as unknown as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0]
        expect(call.kind).toBe("ve-dich.pickBatch")
        expect(call.questionIds).toHaveLength(3)
        expect(new Set(call.questionIds).size).toBe(3)
        for (const id of call.questionIds) expect(["a", "b", "c"]).toContain(id)
    })

    it("phase 1: a used question is drawn but inert", () => {
        renderRound(
            "ve-dich",
            {},
            {
                open: [],
                board: [
                    freeCell("q30", 30),
                    { questionId: "q20", value: 20, where: "taken" as const },
                ],
                table: TWO_PLAYERS,
            },
            veDichMc({ phase: 1, turnPlayerId: null }),
            [veQuestion("q30", 30), veQuestion("q20", 20)],
        )

        expect(screen.getAllByTitle("Câu 20 điểm đã dùng")).toHaveLength(1)
        expect(screen.getAllByTitle("Chọn câu 30 điểm")).toHaveLength(1)
    })

    it("phase 2: a question played in lượt chung is drawn but inert", () => {
        renderRound(
            "ve-dich",
            {},
            {
                open: [],
                selectedPlayerId: "u1",
                board: [
                    { questionId: "q20", value: 20, where: "taken" as const },
                    freeCell("q40", 40),
                ],
                table: TWO_PLAYERS,
            },
            veDichMc({ phase: 2, turnPlayerId: "u1" }),
            [veQuestion("q20", 20), veQuestion("q40", 40)],
        )

        expect(screen.getAllByTitle("Câu 20 điểm đã dùng")).toHaveLength(1)
        expect(screen.getAllByTitle("Chọn câu 40 điểm")).toHaveLength(1)
        expect(screen.queryByTitle("Chọn câu 20 điểm")).toBeNull()
    })

    it("phase 2: the board stays grey until the controller picks a seat", () => {
        renderRound(
            "ve-dich",
            {},
            {
                open: [],
                selectedPlayerId: null,
                board: [freeCell("q40", 40), freeCell("q50", 50)],
                table: TWO_PLAYERS,
            },
            veDichMc({ phase: 2, turnPlayerId: "u1" }),
            [veQuestion("q40", 40), veQuestion("q50", 50)],
        )

        expect(screen.getAllByTitle("Chọn thí sinh trước")).toHaveLength(2)
        expect(screen.queryByTitle("Chọn câu 40 điểm")).toBeNull()
        expect(screen.queryByTitle("Chọn câu 50 điểm")).toBeNull()
    })

    it("phase 1: with nothing picked, there is no confirm — Chọn lại clears", async () => {
        renderRound("ve-dich", { send: vi.fn() }, {}, veDichMc({ phase: 1 }))

        expect(screen.queryByRole("button", { name: "Xác nhận" })).toBeNull()
        expect(screen.getByText("Chọn lại")).toBeInTheDocument()
        expectButtonsInOrder(["Về sảnh"])
    })

    it("phase 2: Xác nhận locks in the batch", async () => {
        const user = userEvent.setup()
        const f = renderRound("ve-dich", { send: vi.fn() }, {
            open: [],
            board: [
                { questionId: "q9", value: 40, where: "pending" as const },
                { questionId: "q10", value: 40, where: "pending" as const },
                { questionId: "q11", value: 40, where: "pending" as const },
            ],
        }, veDichMc({ phase: 2, pendingQuestionId: "q9", turnPicked: 3 }))

        await user.click(screen.getByRole("button", { name: "Xác nhận" }))
        expect(f.send).toHaveBeenCalledWith({ kind: "ve-dich.confirmPicks" })
    })

    it("phase 1: after confirming, the board hands over to the play screen", () => {
        const f = renderRound(
            "ve-dich",
            {},
            {
                open: [],
                board: [
                    { questionId: "q20", value: 20, where: "pending" as const },
                    { questionId: "q30", value: 30, where: "pending" as const },
                ],
                table: TWO_PLAYERS,
            },
            veDichMc({ phase: 1, picksConfirmed: true }),
        )

        expect(f.v.console).toMatchObject({ roundId: "ve-dich", console: { picksConfirmed: true } })
        expect(screen.queryByRole("button", { name: "Xác nhận" })).toBeNull()
        expect(screen.queryByRole("button", { name: "Chọn lại" })).toBeNull()
        expect(screen.getByText("Đếm giờ")).toBeInTheDocument()
    })

    it("phase 2: Xác nhận is live from the first pick — three is a ceiling, not a target", async () => {
        const user = userEvent.setup()
        const f = renderRound("ve-dich", { send: vi.fn() }, {
            open: [],
            board: [
                { questionId: "q9", value: 40, where: "pending" as const },
                { questionId: "q10", value: 40, where: "pending" as const },
            ],
        }, veDichMc({ phase: 2, pendingQuestionId: "q9", turnPicked: 1 }))

        await user.click(screen.getByRole("button", { name: "Xác nhận" }))
        expect(f.send).toHaveBeenCalledWith({ kind: "ve-dich.confirmPicks" })
    })

    it("phase 2: the batch stops at three — a fourth cell sends nothing", async () => {
        const user = userEvent.setup()
        const f = renderRound("ve-dich", {}, {
            open: [],
            board: [
                { questionId: "q9", value: 20, where: "pending" as const },
                { questionId: "q10", value: 30, where: "pending" as const },
                { questionId: "q11", value: 40, where: "pending" as const },
                { questionId: "q12", value: 50, where: "free" as const },
            ],
            selectedPlayerId: "u1",
        }, veDichMc({ phase: 2, pendingQuestionId: "q9", turnPicked: 3 }))

        await user.click(screen.getByTitle("Đã đủ câu"))
        expect(f.send).not.toHaveBeenCalled()
    })

    it("phase 2: the ceiling is the rule's pickCount, not a hard-coded three", async () => {
        const user = userEvent.setup()
        const f = renderRound("ve-dich", {}, {
            open: [],
            board: [
                { questionId: "q9", value: 20, where: "pending" as const },
                { questionId: "q10", value: 30, where: "pending" as const },
                { questionId: "q11", value: 40, where: "free" as const },
            ],
            selectedPlayerId: "u1",
        }, veDichMc({ phase: 2, pendingQuestionId: "q9", turnPicked: 2, pickCount: 2 }))

        await user.click(screen.getByTitle("Đã đủ câu"))
        expect(f.send).not.toHaveBeenCalled()
    })

    it("phase 2: a rule that allows four takes a fourth pick", async () => {
        const user = userEvent.setup()
        const f = renderRound("ve-dich", {}, {
            open: [],
            board: [
                { questionId: "q9", value: 20, where: "pending" as const },
                { questionId: "q10", value: 30, where: "pending" as const },
                { questionId: "q11", value: 40, where: "pending" as const },
                { questionId: "q12", value: 50, where: "free" as const },
            ],
            selectedPlayerId: "u1",
        }, veDichMc({ phase: 2, pendingQuestionId: "q9", turnPicked: 3, pickCount: 4 }))

        await user.click(screen.getByTitle("Chọn câu 50 điểm"))
        expect(f.send).toHaveBeenCalledWith({
            kind: "ve-dich.pickBatch",
            playerId: "u1",
            questionIds: ["q9", "q10", "q11", "q12"],
        })
    })

    it("phase 2: two picks already confirm the batch", async () => {
        const user = userEvent.setup()
        const f = renderRound("ve-dich", { send: vi.fn() }, {
            open: [],
            board: [
                { questionId: "q9", value: 40, where: "pending" as const },
                { questionId: "q10", value: 40, where: "pending" as const },
            ],
        }, veDichMc({ phase: 2, pendingQuestionId: "q9", turnPicked: 2 }))

        await user.click(screen.getByRole("button", { name: "Xác nhận" }))
        expect(f.send).toHaveBeenCalledWith({ kind: "ve-dich.confirmPicks" })
    })

    it("…but confirms once the turn was picked as three", async () => {
        const user = userEvent.setup()
        const f = renderRound("ve-dich", { send: vi.fn() }, {
            open: [],
            board: [
                { questionId: "q10", value: 40, where: "pending" as const },
                { questionId: "q11", value: 40, where: "pending" as const },
            ],
        }, veDichMc({ phase: 2, pendingQuestionId: "q10", turnPicked: 3 }))

        await user.click(screen.getByRole("button", { name: "Xác nhận" }))
        expect(f.send).toHaveBeenCalledWith({ kind: "ve-dich.confirmPicks" })
    })

    it("after Xác nhận the board moves to the rieng screen with the staged chips", () => {
        renderRound(
            "ve-dich", {},
            {
                open: [],
                board: [
                    { questionId: "q9", value: 40, where: "pending" as const },
                    { questionId: "q10", value: 40, where: "pending" as const },
                    { questionId: "q11", value: 50, where: "pending" as const },
                ],
            },
            veDichMc({ phase: 2, picksConfirmed: true, turnPlayerId: "u1", pendingQuestionId: "q9", turnPicked: 3 }),
        )

        expect(screen.queryByRole("button", { name: "Xác nhận" })).toBeNull()
        expect(screen.getAllByRole("button", { name: "40" })).toHaveLength(2)
        expect(screen.getByRole("button", { name: "50" })).toBeInTheDocument()
        expect(screen.getByRole("button", { name: "Chọn lại" })).toBeInTheDocument()
    })
})
