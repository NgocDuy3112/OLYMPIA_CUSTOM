import { expect, it, describe, vi } from "vitest"
import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import {
    TWO_PLAYERS,
    THREE_PLAYERS,
    answerRow,
    expectButtonsInOrder,
    openQ,
    renderRound,
    veDichMc,
} from "../../helpers/stage-facts"

describe("VeDichChung — S7, phase 1 question", () => {
    it("the question card reveals the question — Đếm giờ waits for it", async () => {
        const user = userEvent.setup()
        const f = renderRound(
            "ve-dich",
            {},
            {
                open: [openQ],
                board: [{ questionId: "q1", value: 20, where: "open" }],
            },
            veDichMc({ phase: 1, revealed: false, clockStarted: false }),
        )

        expect(screen.queryByRole("button", { name: "Đếm giờ" })).toBeNull()
        await user.click(screen.getByRole("button", { name: "20" }))
        expect(f.sendChain).toHaveBeenCalledWith([
            { kind: "ve-dich.reveal" },
        ])
    })

    it("the pick board carries one chip per staged pick — N, not a fixed 4", () => {
        renderRound(
            "ve-dich",
            {},
            {
                open: [],
                board: [
                    { questionId: "q1", value: 20, where: "pending" as const },
                    { questionId: "q2", value: 30, where: "pending" as const },
                    { questionId: "q3", value: 20, where: "pending" as const },
                ],
                table: THREE_PLAYERS,
            },
            veDichMc({ phase: 1 }),
        )

        expect(screen.getByRole("button", { name: "Xác nhận" })).toBeInTheDocument()
    })

    it("Đếm giờ starts the clock once the question is revealed", async () => {
        const user = userEvent.setup()
        const f = renderRound(
            "ve-dich",
            {},
            { open: [openQ] },
            veDichMc({ phase: 1, revealed: true, clockStarted: false }),
        )

        await user.click(screen.getByRole("button", { name: "Đếm giờ" }))
        expect(f.send).toHaveBeenCalledWith({ kind: "ve-dich.startClock" })
    })

    it("Đếm giờ does not re-arm once the clock already started", () => {
        // Engine: StartClock refuses an already started window (ALREADY_OPEN).
        renderRound(
            "ve-dich",
            { remaining: 0 },
            { open: [{ questionId: "q1", deadlineAt: "2026-01-01T00:00:00.000Z", question: null }] },
            veDichMc({ phase: 1, revealed: true, clockStarted: true }),
        )

        expect(screen.queryByRole("button", { name: "Đếm giờ" })).toBeNull()
    })

    it("keeps Hết lượt locked while the clock is still running", () => {
        // Closing now would close the window the contestants are answering into:
        // their points could no longer be graded (VeDichJudge needs an open one).
        renderRound(
            "ve-dich",
            { remaining: 12, rows: [] },
            { open: [{ questionId: "q1", deadlineAt: "2026-01-01T00:00:12.000Z", question: null }] },
            veDichMc({ phase: 1, revealed: true, clockStarted: true }),
        )

        expect(screen.queryByRole("button", { name: "Hết lượt" })).toBeNull()
    })

    it("keeps Hết lượt locked while an answer is still unjudged", () => {
        renderRound(
            "ve-dich",
            { rows: [answerRow("u1", null)] },
            { open: [openQ] },
            veDichMc({ phase: 1 }),
        )
        expect(screen.queryByRole("button", { name: "Hết lượt" })).toBeNull()
    })

    it("Hết lượt closes the question on stage once the clock ran and everyone was graded", async () => {
        const user = userEvent.setup()
        const f = renderRound(
            "ve-dich",
            { hetLuot: vi.fn(), rows: [answerRow("u1", "CORRECT")], target: "u1" },
            { open: [openQ] },
            veDichMc({ phase: 1, revealed: true, clockStarted: true }),
        )

        expectButtonsInOrder(["Chấm điểm", "Hết lượt", "Về sảnh"])
        await user.click(screen.getByRole("button", { name: "Hết lượt" }))
        expect(f.hetLuot).toHaveBeenCalledOnce()
    })

    it("Hết lượt stays inert until the question's clock started", () => {
        // Engine: CloseQuestion refuses NOT_REVEALED / CLOCK_NOT_STARTED, and an
        // untouched question is not played yet — the turn must not move on.
        renderRound(
            "ve-dich",
            { hetLuot: vi.fn(), rows: [] },
            { open: [openQ] },
            veDichMc({ phase: 1, clockStarted: false }),
        )

        expect(screen.queryByRole("button", { name: "Hết lượt" })).toBeNull()
    })

    it("with no question open the batch is done — no Hết lượt left to press", () => {
        renderRound(
            "ve-dich",
            { hetLuot: vi.fn(), rows: [] },
            { open: [] },
            veDichMc({ phase: 1, picksConfirmed: true, pendingQuestionId: null }),
        )

        expect(screen.queryByRole("button", { name: "Hết lượt" })).toBeNull()
        expect(screen.getByRole("button", { name: "Chấm điểm" })).toBeInTheDocument()
    })

    it("the strip buttons carry no tooltips", () => {
        renderRound(
            "ve-dich",
            { rows: [answerRow("u1", "CORRECT")], target: "u1" },
            { open: [openQ] },
            veDichMc({ phase: 1 }),
        )

        expect(screen.getByRole("button", { name: "Về sảnh" })).not.toHaveAttribute("title")
    })

    it("Chấm điểm marks the selected player — ve-dich.judge", async () => {
        const user = userEvent.setup()
        const f = renderRound(
            "ve-dich",
            { sendChain: vi.fn(), rows: [answerRow("u1", null)], target: "u1" },
            { open: [openQ], table: TWO_PLAYERS },
            veDichMc({ phase: 1 }),
        )

        await user.click(screen.getByRole("button", { name: "Chấm điểm" }))
        expect(f.sendChain).toHaveBeenCalledWith([
            { kind: "ve-dich.judge", playerId: "u1", correct: true },
            { kind: "ve-dich.judge", playerId: "u2", correct: false },
        ])
    })

    it("Chấm điểm marks everyone left out as wrong", async () => {
        const user = userEvent.setup()
        const f = renderRound(
            "ve-dich",
            {
                sendChain: vi.fn(),
                rows: [answerRow("u1", null), answerRow("u2", null)],
                target: "u1",
            },
            { open: [openQ], table: TWO_PLAYERS },
            veDichMc({ phase: 1 }),
        )

        await user.click(screen.getByRole("button", { name: "Chấm điểm" }))
        expect(f.sendChain).toHaveBeenCalledWith([
            { kind: "ve-dich.judge", playerId: "u1", correct: true },
            { kind: "ve-dich.judge", playerId: "u2", correct: false },
        ])
    })

    it("one press grades every ticked player", async () => {
        const user = userEvent.setup()
        const f = renderRound(
            "ve-dich",
            {
                sendChain: vi.fn(),
                rows: [answerRow("u1", null), answerRow("u2", null)],
                target: "u1",
                selectedIds: new Set(["u1", "u2"]),
            },
            { open: [openQ], table: TWO_PLAYERS },
            veDichMc({ phase: 1 }),
        )

        await user.click(screen.getByRole("button", { name: "Chấm điểm" }))
        expect(f.sendChain).toHaveBeenCalledWith([
            { kind: "ve-dich.judge", playerId: "u1", correct: true },
            { kind: "ve-dich.judge", playerId: "u2", correct: true },
        ])
    })

    it("Chấm điểm is offered even when nobody submitted an answer", async () => {
        const user = userEvent.setup()
        const f = renderRound(
            "ve-dich",
            { sendChain: vi.fn(), rows: [] },
            { open: [openQ], table: TWO_PLAYERS },
            veDichMc({ phase: 1 }),
        )

        await user.click(screen.getByRole("button", { name: "Chấm điểm" }))
        expect(f.sendChain).toHaveBeenCalledWith([
            { kind: "ve-dich.judge", playerId: "u1", correct: false },
            { kind: "ve-dich.judge", playerId: "u2", correct: false },
        ])
    })

    it("one press with no card ticked deducts from every player", async () => {
        const user = userEvent.setup()
        const f = renderRound(
            "ve-dich",
            { sendChain: vi.fn(), rows: [answerRow("u1", null)], selectedIds: new Set<string>() },
            { open: [openQ], table: TWO_PLAYERS },
            veDichMc({ phase: 1 }),
        )

        await user.click(screen.getByRole("button", { name: "Chấm điểm" }))
        expect(f.sendChain).toHaveBeenCalledWith([
            { kind: "ve-dich.judge", playerId: "u1", correct: false },
            { kind: "ve-dich.judge", playerId: "u2", correct: false },
        ])
    })

    it("a ticked card earns the points while everyone else keeps losing them", async () => {
        const user = userEvent.setup()
        const f = renderRound(
            "ve-dich",
            { sendChain: vi.fn(), rows: [], selectedIds: new Set(["u2"]) },
            { open: [openQ], table: TWO_PLAYERS },
            veDichMc({ phase: 1 }),
        )

        await user.click(screen.getByRole("button", { name: "Chấm điểm" }))
        expect(f.sendChain).toHaveBeenCalledWith([
            { kind: "ve-dich.judge", playerId: "u1", correct: false },
            { kind: "ve-dich.judge", playerId: "u2", correct: true },
        ])
    })

    it("a ticked card is clearly highlighted on the rail", () => {
        renderRound(
            "ve-dich",
            {
                rows: [],
                selectedIds: new Set(["u1"]),
                baseCards: [
                    { id: "u1", name: "An", points: 10 },
                    { id: "u2", name: "Bình", points: 0 },
                ],
            },
            { open: [openQ], table: TWO_PLAYERS },
            veDichMc({ phase: 1 }),
        )

        const picked = document.querySelector('[aria-pressed="true"]')
        expect(picked?.textContent).toContain("An")
        expect(picked?.className).toContain("ring-4")
        expect(document.querySelectorAll('[aria-pressed="true"]')).toHaveLength(1)
    })

    it("Hiện trả lời reveals the open question's answer once the clock ran out", async () => {
        const user = userEvent.setup()
        const f = renderRound("ve-dich", {}, { open: [openQ] }, veDichMc({ phase: 1, clockStarted: true }))

        await user.click(screen.getByRole("button", { name: "Hiện trả lời" }))
        expect(f.send).toHaveBeenCalledWith({ kind: "reveal.answer", questionId: "q1" })
    })

    it("has no Câu tiếp — the controller opens the staged questions directly", () => {
        renderRound(
            "ve-dich",
            { hetLuot: vi.fn(), rows: [answerRow("u1", "CORRECT"), answerRow("u2", "INCORRECT")] },
            { open: [openQ] },
            veDichMc({ phase: 1 }),
        )

        expect(screen.queryByText("Câu tiếp")).toBeNull()
        expectButtonsInOrder(["Chấm điểm", "Về sảnh"])
    })

    it("keeps every question of the turn on the strip after switching", () => {
        renderRound(
            "ve-dich",
            { rows: [answerRow("u1", "CORRECT")] },
            {
                open: [{ questionId: "q1", deadlineAt: null, question: null }],
                board: [
                    { questionId: "q1", value: 20, where: "open" },
                    { questionId: "q2", value: 20, where: "pending" },
                    { questionId: "q3", value: 30, where: "taken" },
                    { questionId: "q4", value: 30, where: "taken" },
                ],
            },
            veDichMc({
                phase: 1,
                revealed: true,
                turnQuestions: ["q1", "q2", "q3", "q4"],
                turnValues: [20, 20, 30, 30],
            }),
        )

        // Chung may stage one question per player — up to four.
        expect(screen.getAllByTitle(/^Câu \d+ đang mở$/)).toHaveLength(1)
        const chips = document.querySelectorAll('button[title^="Câu 30 điểm đã chơi"], button[title^="Mở câu "]')
        expect(chips.length).toBe(3)
    })

    it("chips are all the same width", () => {
        renderRound(
            "ve-dich",
            { rows: [answerRow("u1", "CORRECT")] },
            {
                open: [{ questionId: "q1", deadlineAt: null, question: null }],
                board: [
                    { questionId: "q1", value: 20, where: "open" },
                    { questionId: "q2", value: 30, where: "pending" },
                ],
            },
            veDichMc({
                phase: 1,
                revealed: true,
                turnQuestions: ["q1", "q2"],
                turnValues: [20, 30],
            }),
        )

        const chips = Array.from(document.querySelectorAll("button"))
            .filter((el) => el.className.includes("h-[4.43cqw]"))
        expect(chips).toHaveLength(2)
        for (const chip of chips) {
            expect(chip.className).toContain("w-[7cqw]")
            expect(chip.className).not.toContain("min-w-[7cqw]")
        }
        // Only the live question breathes.
        const live = chips.filter((chip) => chip.className.includes("stage-pulse"))
        expect(live).toHaveLength(1)
    })

    it("switches to another staged question once the open one is fully judged", async () => {
        const user = userEvent.setup()
        const f = renderRound(
            "ve-dich",
            { sendChain: vi.fn(), rows: [answerRow("u1", "CORRECT"), answerRow("u2", "INCORRECT")] },
            {
                open: [openQ],
                board: [
                    { questionId: "q1", value: 20, where: "open" },
                    { questionId: "q2", value: 30, where: "pending" },
                ],
            },
            veDichMc({ phase: 1, revealed: true, clockStarted: true }),
        )

        await user.click(screen.getByRole("button", { name: /^30$/ }))
        expect(f.sendChain).toHaveBeenCalledWith([
            { kind: "ve-dich.closeQuestion" },
            { kind: "ve-dich.openPending", questionId: "q2" },
        ])
    })

    it("chips stay clickable after the open question was revealed", async () => {
        const user = userEvent.setup()
        const f = renderRound(
            "ve-dich",
            { sendChain: vi.fn(), rows: [answerRow("u1", "CORRECT")] },
            {
                open: [openQ],
                board: [
                    { questionId: "q1", value: 20, where: "open" },
                    { questionId: "q2", value: 30, where: "pending" },
                ],
            },
            veDichMc({ phase: 1, revealed: true, clockStarted: true }),
        )

        await user.click(screen.getByRole("button", { name: /^30$/ }))
        expect(f.sendChain).toHaveBeenCalledWith([
            { kind: "ve-dich.closeQuestion" },
            { kind: "ve-dich.openPending", questionId: "q2" },
        ])
    })

    it("refuses to switch away while an answer is still unjudged", async () => {
        const user = userEvent.setup()
        const f = renderRound(
            "ve-dich",
            { sendChain: vi.fn(), rows: [answerRow("u1", null)] },
            {
                open: [openQ],
                board: [
                    { questionId: "q1", value: 20, where: "open" },
                    { questionId: "q2", value: 30, where: "pending" },
                ],
            },
            veDichMc({ phase: 1, revealed: false }),
        )

        const other = screen.getByRole("button", { name: /^30$/ })
        expect(other).toHaveAttribute("aria-disabled", "true")
        await user.click(other)
        expect(f.sendChain).not.toHaveBeenCalled()
    })

    it("refuses to switch away while the clock runs and nobody has answered yet", async () => {
        const user = userEvent.setup()
        const f = renderRound(
            "ve-dich",
            { sendChain: vi.fn(), rows: [] },
            {
                open: [{ questionId: "q1", deadlineAt: "2026-01-01T00:00:20.000Z", question: null }],
                board: [
                    { questionId: "q1", value: 20, where: "open" },
                    { questionId: "q2", value: 30, where: "pending" },
                ],
            },
            veDichMc({ phase: 1, revealed: true, clockStarted: true }),
        )

        // Contestants are still typing: their answers are not in `rows` yet.
        const other = screen.getByRole("button", { name: /^30$/ })
        expect(other).toHaveAttribute("aria-disabled", "true")
        await user.click(other)
        expect(f.sendChain).not.toHaveBeenCalled()
    })

    it("switches away from an open question nobody touched — before its clock", async () => {
        const user = userEvent.setup()
        const f = renderRound(
            "ve-dich",
            { sendChain: vi.fn(), rows: [] },
            {
                open: [openQ],
                board: [
                    { questionId: "q1", value: 20, where: "open" },
                    { questionId: "q2", value: 30, where: "pending" },
                ],
            },
            veDichMc({ phase: 1, revealed: false, clockStarted: false }),
        )

        await user.click(screen.getByRole("button", { name: /^30$/ }))
        // Engine: CloseQuestion refuses a question whose clock never started; OpenPending
        // swaps the untouched question back into the batch itself, so no close is sent.
        expect(f.sendChain).toHaveBeenCalledWith([
            { kind: "ve-dich.openPending", questionId: "q2" },
            { kind: "ve-dich.reveal" },
        ])
    })

    it("a played question stays on the strip but is no longer clickable", async () => {
        const user = userEvent.setup()
        // Engine: OpenPending only takes a question still in PendingPicks — a closed
        // one left the turn for good, so clicking it would close the open question
        // and then fail on a question the engine no longer has.
        const f = renderRound(
            "ve-dich",
            { sendChain: vi.fn(), rows: [] },
            {
                open: [openQ],
                board: [
                    { questionId: "q1", value: 20, where: "open" },
                    { questionId: "q2", value: 30, where: "taken" },
                    { questionId: "q3", value: 40, where: "pending" },
                ],
            },
            veDichMc({
                phase: 1, picksConfirmed: true, revealed: false, clockStarted: false,
                turnQuestions: ["q1", "q2", "q3"], turnValues: [20, 30, 40],
            }),
        )

        const played = screen.getByTitle("Câu 30 điểm đã chơi")
        expect(played).toHaveAttribute("aria-disabled", "true")
        await user.click(played)
        expect(f.sendChain).not.toHaveBeenCalled()

        await user.click(screen.getByTitle("Mở câu 40 điểm"))
        // The open question was never clocked, so OpenPending swaps it back instead of
        // closing it (CloseQuestion: CLOCK_NOT_STARTED).
        expect(f.sendChain).toHaveBeenCalledWith([
            { kind: "ve-dich.openPending", questionId: "q3" },
            { kind: "ve-dich.reveal" },
        ])
    })
})
