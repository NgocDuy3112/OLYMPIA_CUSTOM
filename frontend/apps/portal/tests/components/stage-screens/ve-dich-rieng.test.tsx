import { expect, it, describe, vi } from "vitest"
import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import type { VeDichConsole } from "@/lib/live"
import {
    TWO_PLAYERS,
    expectButtonsInOrder,
    openQ,
    renderRound,
    veDichMc,
} from "../../helpers/stage-facts"

describe("VeDichRieng — the powers and the duel", () => {
    const BUTTON = { selector: "button" } as const
    const opened = { open: [openQ] }

    const pickBoard = {
        open: [],
        board: [{ questionId: "a", value: 40, where: "pending" as const }],
    }
    const stagedQuestion = {
        _id: "a", roundId: "ve-dich", turnId: "phase-2", position: 1,
        kind: "TEXT" as const, questionText: "câu a", timeLimit: 30, points: 40, payload: { acceptedAnswers: [] },
    }

    it("the power buttons live on the rieng page — before the clock or reveal", async () => {
        const user = userEvent.setup()
        const f = renderRound(
            "ve-dich", {}, pickBoard,
            veDichMc({ phase: 2, turnPlayerId: "u1", pendingQuestionId: "a", picksConfirmed: true }),
            [stagedQuestion],
        )

        await user.click(screen.getByRole("button", { name: "Ngôi sao hy vọng" }))
        expect(f.send).toHaveBeenCalledWith({
            kind: "ve-dich.declarePower", playerId: "u1", power: "STAR",
        })
    })

    it("Chỉ định đối kháng arms first — nothing is sent until a card is picked", async () => {
        const user = userEvent.setup()
        const f = renderRound(
            "ve-dich", {}, pickBoard,
            veDichMc({ phase: 2, turnPlayerId: "u1", pendingQuestionId: "a", picksConfirmed: true }),
            [stagedQuestion],
        )
        await user.click(screen.getByRole("button", { name: "Chỉ định đối kháng" }))
        expect(f.send).not.toHaveBeenCalled()
        expect(screen.getByText("chọn thẻ để chỉ định")).toBeInTheDocument()
    })

    it("the second click on a card names the player the question is handed to", async () => {
        const user = userEvent.setup()
        const f = renderRound(
            "ve-dich",
            { baseCards: [{ id: "u1", name: "An", points: 10 }, { id: "u2", name: "Bình", points: 5 }] },
            pickBoard,
            veDichMc({ phase: 2, turnPlayerId: "u1", pendingQuestionId: "a", picksConfirmed: true }),
            [stagedQuestion],
        )
        await user.click(screen.getByRole("button", { name: "Chỉ định đối kháng" }))
        await user.click(screen.getByText("Bình"))
        expect(f.send).toHaveBeenCalledWith({
            kind: "ve-dich.declarePower", playerId: "u1", power: "ASSIGN", targetId: "u2",
        })
    })

    it("an armed ASSIGN leaves the turn player off the rail — they cannot be the target", async () => {
        const user = userEvent.setup()
        renderRound(
            "ve-dich",
            { baseCards: [{ id: "u1", name: "An", points: 10 }, { id: "u2", name: "Bình", points: 5 }] },
            pickBoard,
            veDichMc({ phase: 2, turnPlayerId: "u1", pendingQuestionId: "a", picksConfirmed: true }),
            [stagedQuestion],
        )
        expect(screen.getByText("An")).toBeInTheDocument()
        await user.click(screen.getByRole("button", { name: "Chỉ định đối kháng" }))
        expect(screen.queryByText("An")).toBeNull()
        expect(screen.getByText("Bình")).toBeInTheDocument()
    })

    it("one power per turn: the buttons go inert once the turn's only power was spent", () => {
        renderRound(
            "ve-dich", {}, opened,
            veDichMc({ phase: 2, turnPlayerId: "u1", pendingQuestionId: "a", powersLeft: [] }),
            [stagedQuestion],
        )
        expect(screen.queryByRole("button", { name: "Ngôi sao hy vọng" })).toBeNull()
        expect(screen.queryByRole("button", { name: "Chỉ định đối kháng" })).toBeNull()
        expect(screen.getByText("đã chốt")).toBeInTheDocument()
    })

    it("…but a new turn re-arms both powers — locked only when the set is empty", () => {
        renderRound(
            "ve-dich", {}, pickBoard,
            veDichMc({ phase: 2, turnPlayerId: "u1", pendingQuestionId: "a", picksConfirmed: true, powersLeft: ["STAR", "ASSIGN"] }),
            [stagedQuestion],
        )
        expect(screen.getByRole("button", { name: "Ngôi sao hy vọng" })).toBeInTheDocument()
        expect(screen.getByRole("button", { name: "Chỉ định đối kháng" })).toBeInTheDocument()
    })

    it("after staging a power the buttons are inert — only cancelling frees the turn", async () => {
        const user = userEvent.setup()
        const f = renderRound(
            "ve-dich", {}, pickBoard,
            veDichMc({
                phase: 2, turnPlayerId: "u1", pendingQuestionId: "a", picksConfirmed: true,
                powersLeft: ["STAR", "ASSIGN"], turnPowerUsed: true,
                stagedPower: { power: "ASSIGN", targetId: "u2" },
            }),
            [stagedQuestion],
        )
        expect(screen.queryByRole("button", { name: "Ngôi sao hy vọng" })).toBeNull()
        expect(screen.queryByRole("button", { name: "Chỉ định đối kháng" })).toBeNull()

        await user.click(screen.getByRole("button", { name: "Không dùng quyền năng" }))
        expect(f.send).toHaveBeenCalledWith({
            kind: "ve-dich.declarePower", playerId: "u1", power: null, targetId: undefined,
        })
    })

    it("no cancel while nothing is staged", () => {
        renderRound(
            "ve-dich", {}, pickBoard,
            veDichMc({ phase: 2, turnPlayerId: "u1", pendingQuestionId: "a", picksConfirmed: true }),
            [stagedQuestion],
        )
        expect(screen.queryByRole("button", { name: "Không dùng quyền năng" })).toBeNull()
    })

    it("the power buttons are muted once the question started", () => {
        renderRound(
            "ve-dich",
            { oralRemaining: 20 },
            { open: [{ questionId: "q1", deadlineAt: "2026-01-01T00:00:20.000Z", question: null }] },
            veDichMc({ phase: 2, turnPlayerId: "u1", pendingQuestionId: "a" }),
            [stagedQuestion],
        )
        expect(screen.queryByRole("button", { name: "Ngôi sao hy vọng" })).toBeNull()
        expect(screen.queryByRole("button", { name: "Chỉ định đối kháng" })).toBeNull()
    })

    it("a rail card picks who plays next", async () => {
        const user = userEvent.setup()
        const f = renderRound(
            "ve-dich",
            { baseCards: [{ id: "u1", name: "An", points: 10 }, { id: "u2", name: "Bình", points: 5 }] },
            pickBoard,
            veDichMc({ phase: 2, turnPlayerId: "u1", pendingQuestionId: "a" }),
            [stagedQuestion],
        )
        await user.click(screen.getByText("Bình"))
        expect(f.send).toHaveBeenCalledWith({ kind: "ve-dich.setTurn", playerId: "u2" })
    })

    it("the row is absent before the turn's picks are staged (nothing to power)", () => {
        renderRound(
            "ve-dich", {}, { open: [], board: [{ questionId: "a", value: 40, where: "free" as const }] },
            veDichMc({ phase: 2, turnPlayerId: "u1" }),
            [stagedQuestion],
        )
        expect(screen.queryByText("Ngôi sao hy vọng", BUTTON)).toBeNull()
        expect(screen.queryByText("Không dùng quyền năng", BUTTON)).toBeNull()
    })

    it("the pick board carries no power buttons at all", () => {
        renderRound(
            "ve-dich", {}, pickBoard,
            veDichMc({ phase: 2, turnPlayerId: "u1", pendingQuestionId: "a", turnPowerUsed: true }),
            [stagedQuestion],
        )
        expect(screen.queryByRole("button", { name: "Ngôi sao hy vọng" })).toBeNull()
        expect(screen.queryByRole("button", { name: "Chỉ định đối kháng" })).toBeNull()
        expect(screen.queryByRole("button", { name: "Không dùng quyền năng" })).toBeNull()
        expect(screen.queryByText("đã chốt")).toBeNull()
    })

    it("during a duel the buzz slot is inert — an ASSIGN question has nothing to close", () => {
        renderRound("ve-dich", {}, opened, veDichMc({ phase: 2, power: "ASSIGN", assignedToId: "u2" }))
        expect(screen.queryByText("Mở chuông", BUTTON)).toBeNull()
        expect(screen.getByText("Mở chuông")).toBeInTheDocument()
    })

    it("a live race can be ended: Khoá chuông sends the lock", async () => {
        const user = userEvent.setup()
        const f = renderRound("ve-dich", {}, opened, veDichMc({
            phase: 2, power: "ASSIGN", assignedToId: "u2", openStage: "buzz", clockStarted: true,
        }))

        await user.click(screen.getByText("Khoá chuông", BUTTON))
        expect(f.send).toHaveBeenCalledWith({ kind: "ve-dich.lockBuzz" })
    })

    it("the lock is inert until the buzz window actually started", () => {
        renderRound("ve-dich", {}, opened, veDichMc({
            phase: 2, power: "ASSIGN", assignedToId: "u2", openStage: "buzz", clockStarted: false,
        }))
        expect(screen.queryByText("Khoá chuông", BUTTON)).toBeNull()
        expect(screen.getByText("Khoá chuông")).toBeInTheDocument()
    })

    it("the lock is inert once someone buzzed — the race is already settled", () => {
        renderRound("ve-dich", {}, opened, veDichMc({
            phase: 2, power: "ASSIGN", openStage: "buzz", clockStarted: true, buzzerId: "u2",
        }))
        expect(screen.queryByText("Khoá chuông", BUTTON)).toBeNull()
        expect(screen.getByText("Khoá chuông")).toBeInTheDocument()
    })

    it("before the duel, Mở chuông is a real button", () => {
        renderRound("ve-dich", {}, opened, veDichMc({ phase: 2, clockStarted: true }))
        expect(screen.getByText("Mở chuông", BUTTON)).toBeInTheDocument()
    })
})

describe("VeDichRieng — S8, phase 2 question", () => {
    it("a ticked card is clearly highlighted on the rail, like the chung screen", () => {
        renderRound(
            "ve-dich",
            {
                selectedIds: new Set(["u1"]),
                baseCards: [
                    { id: "u1", name: "An", points: 10 },
                    { id: "u2", name: "Bình", points: 0 },
                ],
            },
            { open: [openQ], table: TWO_PLAYERS },
            veDichMc({ phase: 2 }),
        )

        const picked = document.querySelector('[aria-pressed="true"]')
        expect(picked?.textContent).toContain("An")
        expect(picked?.className).toContain("ring-4")
        expect(document.querySelectorAll('[aria-pressed="true"]')).toHaveLength(1)
    })

    it("the oral window owns the turn: Hết lượt waits for Mở chuông", async () => {
        const user = userEvent.setup()
        const f = renderRound(
            "ve-dich",
            { send: vi.fn(), hetLuot: vi.fn(), target: "u1", verdictOf: () => "CORRECT" },
            { open: [openQ] },
            veDichMc({ phase: 2, openStage: "current", clockStarted: true }),
        )

        expectButtonsInOrder(["Mở chuông", "Đúng", "Sai", "Về sảnh"])
        // Resolving now would hit a window the engine still holds open (ALREADY_OPEN).
        expect(screen.queryByRole("button", { name: "Hết lượt" })).toBeNull()
        await user.click(screen.getByRole("button", { name: "Mở chuông" }))
        expect(f.send).toHaveBeenCalledWith({ kind: "ve-dich.closeCurrentAnswer" })
        expect(f.hetLuot).not.toHaveBeenCalled()
    })

    it("once the buzzer window is up, Hết lượt resolves the turn", async () => {
        const user = userEvent.setup()
        const f = renderRound(
            "ve-dich",
            { send: vi.fn(), hetLuot: vi.fn(), target: "u1", verdictOf: () => "CORRECT" },
            { open: [openQ] },
            veDichMc({ phase: 2, openStage: "buzz", clockStarted: true }),
        )

        await user.click(screen.getByRole("button", { name: "Hết lượt" }))
        expect(f.hetLuot).toHaveBeenCalledOnce()
    })

    it("the chip reveals the phase 2 question to the players", async () => {
        const user = userEvent.setup()
        const f = renderRound(
            "ve-dich",
            { send: vi.fn(), sendChain: vi.fn() },
            {
                open: [openQ],
                board: [{ questionId: "q1", value: 40, where: "open" }],
            },
            veDichMc({ phase: 2, openStage: "current" }),
        )

        await user.click(screen.getByRole("button", { name: "40" }))
        expect(f.sendChain).toHaveBeenCalled()
    })

    it("locks Hết lượt while a recorded buzzer has no verdict", () => {
        renderRound(
            "ve-dich",
            { verdictOf: (_qid, uid) => (uid === "u1" ? "CORRECT" : null) },
            { open: [openQ] },
            veDichMc({ phase: 2, openStage: "buzz", buzzerId: "u2" }),
        )
        expect(screen.queryByRole("button", { name: "Hết lượt" })).toBeNull()
    })

    it("Về sảnh always sends the round-end plan while the round runs", async () => {
        const user = userEvent.setup()
        const f = renderRound("ve-dich", { verdictOf: () => "CORRECT" }, { open: [openQ] }, veDichMc({ phase: 2 }))
        await user.click(screen.getByRole("button", { name: "Về sảnh" }))
        expect(f.backToLobby).toHaveBeenCalledOnce()
    })
})

// Each of these buttons used to be live while the engine would answer 400/409:
// the screen now asks the engine's own preconditions instead of the clock.
describe("VeDichRieng — buttons match what the engine will accept", () => {
    const staged = {
        open: [],
        board: [
            { questionId: "q1", value: 40, where: "pending" as const },
            { questionId: "q2", value: 40, where: "taken" as const },
        ],
    }
    const twoChips = { turnQuestions: ["q1", "q2"], turnValues: [40, 40], picksConfirmed: true }

    it("no second Đếm giờ once the clock already started", () => {
        // Engine: StartClock refuses a window that already started (ALREADY_OPEN) —
        // an expired clock included, it is a budget, not a stopwatch.
        renderRound(
            "ve-dich", { remaining: 0 },
            { open: [{ questionId: "q1", deadlineAt: "2026-01-01T00:00:00.000Z", question: null }] },
            veDichMc({ phase: 2, openStage: "current", revealed: true, clockStarted: true }),
        )

        expect(screen.queryByRole("button", { name: "Đếm giờ" })).toBeNull()
    })

    it("Đếm giờ is live before the clock was ever started", () => {
        renderRound(
            "ve-dich", { remaining: 0 },
            { open: [{ questionId: "q1", deadlineAt: null, question: null }] },
            veDichMc({ phase: 2, openStage: "current", revealed: true, clockStarted: false }),
        )

        expect(screen.getByRole("button", { name: "Đếm giờ" })).toBeInTheDocument()
    })

    it("a played question stays on the strip but is no longer clickable", async () => {
        const user = userEvent.setup()
        // Engine: OpenPhase2Question only takes a question still in PendingPicks.
        const f = renderRound(
            "ve-dich", { sendChain: vi.fn() }, staged,
            veDichMc({ phase: 2, turnPlayerId: "u1", pendingQuestionId: "q1", ...twoChips }),
        )

        const played = screen.getByTitle("Câu 40 điểm đã chơi")
        expect(played).toHaveAttribute("aria-disabled", "true")
        await user.click(played)
        expect(f.sendChain).not.toHaveBeenCalled()

        await user.click(screen.getByTitle("Mở câu 40 điểm"))
        expect(f.sendChain).toHaveBeenCalledWith([
            { kind: "ve-dich.openQuestion", questionId: "q1" },
            { kind: "ve-dich.reveal" },
        ])
    })

    it("a pending chip cannot be switched to once the window started", () => {
        // Engine: SwitchPhase2Question refuses a revealed/clocked question (ALREADY_OPEN).
        renderRound(
            "ve-dich", {},
            {
                open: [{ questionId: "q1", deadlineAt: null, question: null }],
                board: [
                    { questionId: "q1", value: 40, where: "open" },
                    { questionId: "q2", value: 40, where: "pending" },
                ],
            },
            veDichMc({
                phase: 2, turnPlayerId: "u1", pendingQuestionId: "q2",
                revealed: true, clockStarted: true,
                turnQuestions: ["q1", "q2"], turnValues: [40, 40], picksConfirmed: true,
            }),
        )

        expect(screen.getByTitle("Mở câu 40 điểm")).toHaveAttribute("aria-disabled", "true")
    })

    it("an untouched window still lets the console switch to a pending chip", async () => {
        const user = userEvent.setup()
        const f = renderRound(
            "ve-dich", { sendChain: vi.fn() },
            {
                open: [{ questionId: "q1", deadlineAt: null, question: null }],
                board: [
                    { questionId: "q1", value: 40, where: "open" },
                    { questionId: "q2", value: 50, where: "pending" },
                ],
            },
            veDichMc({
                phase: 2, turnPlayerId: "u1", pendingQuestionId: "q2",
                turnQuestions: ["q1", "q2"], turnValues: [40, 50], picksConfirmed: true,
            }),
        )

        await user.click(screen.getByTitle("Mở câu 50 điểm"))
        expect(f.sendChain).toHaveBeenCalledWith([
            { kind: "ve-dich.switchQuestion", questionId: "q2" },
            { kind: "ve-dich.reveal" },
        ])
    })

    it("no power is offered once the turn has no question left to open", () => {
        // Engine: DeclarePower answers NOTHING_OPEN with an empty PendingPicks.
        renderRound(
            "ve-dich", {}, { open: [], board: [] },
            veDichMc({ phase: 2, turnPlayerId: "u1", pendingQuestionId: null, picksConfirmed: true }),
        )

        expect(screen.queryByRole("button", { name: "Ngôi sao hy vọng" })).toBeNull()
        expect(screen.queryByRole("button", { name: "Chỉ định đối kháng" })).toBeNull()
    })

    it("Chọn lại is inert when the turn has nothing left to clear", async () => {
        const user = userEvent.setup()
        // An empty batch would send the screen back to the pick board for nothing.
        const f = renderRound(
            "ve-dich", { send: vi.fn() }, { open: [], board: [] },
            veDichMc({ phase: 2, turnPlayerId: "u1", pendingQuestionId: null, picksConfirmed: true }),
        )

        expect(screen.queryByRole("button", { name: "Chọn lại" })).toBeNull()
        await user.click(screen.getByText("Chọn lại"))
        expect(f.send).not.toHaveBeenCalled()
    })

    it("Đúng/Sai wait for a ticked card — nobody to grade means no verdict", async () => {
        const user = userEvent.setup()
        const f = renderRound(
            "ve-dich",
            { setVerdict: vi.fn(), baseCards: [{ id: "u1", name: "An", points: 10 }] },
            { open: [openQ] },
            veDichMc({ phase: 2, openStage: "buzz" }),
        )

        expect(screen.getByText("chọn thẻ để chấm")).toBeInTheDocument()
        expect(screen.queryByRole("button", { name: "Đúng" })).toBeNull()
        expect(screen.queryByRole("button", { name: "Sai" })).toBeNull()
        await user.click(screen.getByText("An"))
        expect(f.setVerdict).not.toHaveBeenCalled()
    })

    it("a ticked card makes Đúng/Sai live again", () => {
        renderRound(
            "ve-dich",
            { selectedIds: new Set(["u1"]), baseCards: [{ id: "u1", name: "An", points: 10 }] },
            { open: [openQ] },
            veDichMc({ phase: 2, openStage: "buzz" }),
        )

        expect(screen.queryByText("chọn thẻ để chấm")).toBeNull()
        expect(screen.getByRole("button", { name: "Đúng" })).toBeInTheDocument()
        expect(screen.getByRole("button", { name: "Sai" })).toBeInTheDocument()
    })

    // An ASSIGN question is resolved once the race is settled — locking the buzz
    // window, a recorded buzz with both verdicts, or the race clock running out.
    // `open.power` stays "ASSIGN" for all of them, so it cannot gate the button.
    describe("an ASSIGN question resolves once its race is settled", () => {
        const duel = (over: Partial<VeDichConsole> = {}) => veDichMc({
            phase: 2, openStage: "buzz", clockStarted: true,
            power: "ASSIGN", assignedToId: "u2",
            ...over,
        })
        const raced = { open: [{ questionId: "q1", deadlineAt: "2026-01-01T00:00:30.000Z", question: null }] }
        const expired = { open: [{ questionId: "q1", deadlineAt: "2026-01-01T00:00:00.000Z", question: null }] }

        it("after Khoá chuông — nobody buzzed, the race is over", async () => {
            const user = userEvent.setup()
            const f = renderRound(
                "ve-dich", { verdictOf: () => "CORRECT", hetLuot: vi.fn() },
                { ...raced, capabilities: { canResolve: true } }, duel(),
            )

            expect(screen.getByRole("button", { name: "Khoá chuông" })).toBeInTheDocument()
            await user.click(screen.getByRole("button", { name: "Hết lượt" }))
            expect(f.hetLuot).toHaveBeenCalledOnce()
        })

        it("after a buzz with both verdicts in", async () => {
            const user = userEvent.setup()
            const f = renderRound(
                "ve-dich", { verdictOf: () => "CORRECT", hetLuot: vi.fn() }, raced,
                duel({ buzzerId: "u2" }),
            )

            await user.click(screen.getByRole("button", { name: "Hết lượt" }))
            expect(f.hetLuot).toHaveBeenCalledOnce()
        })

        it("after the race clock ran out", async () => {
            const user = userEvent.setup()
            const f = renderRound(
                "ve-dich", { verdictOf: () => "CORRECT", hetLuot: vi.fn(), remaining: 0 }, expired, duel(),
            )

            await user.click(screen.getByRole("button", { name: "Hết lượt" }))
            expect(f.hetLuot).toHaveBeenCalledOnce()
        })

        it("while the race is still live the engine withholds the resolve", () => {
            renderRound(
                "ve-dich", { verdictOf: () => "CORRECT" }, raced, duel(),
            )

            expect(screen.queryByRole("button", { name: "Hết lượt" })).toBeNull()
        })
    })
})
