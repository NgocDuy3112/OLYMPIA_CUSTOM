import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import type { ConsoleFacts } from "@/components/stage/deck"
import type { LiveResponse, VeDichConsole } from "@/lib/live"
import { roundModuleOf } from "@/rounds"

/**
 * The controller's screens are pure (facts in, elements out — through the
 * round registry), so the fixture IS the console's state. Clickable things are
 * real buttons, which is what these tests query: strip order, gating, and the
 * actions each button sends.
 */
function facts(
    over: Partial<ConsoleFacts> = {},
    projection: Partial<LiveResponse["projection"]> = {},
    mc: unknown = null,
    questions: LiveResponse["questions"] = [],
): ConsoleFacts {
    const v: LiveResponse = {
        version: 1,
        roundId: "khoi-dong",
        state: {},
        questions,
        projection: {
            matchId: "m1",
            roundId: "khoi-dong",
            version: 1,
            stage: "phase1",
            open: [],
            table: [{ id: "u1", displayName: "An", points: 10, rank: 1 }],
            ...projection,
        },
        roundEnded: false,
        console: mc as LiveResponse["console"],
    }
    return {
        v,
        stage: "phase1",
        remaining: 30,
        rows: [],
        baseCards: [],
        judgingId: null,
        target: null,
        setSelectedQ: vi.fn(),
        setSelectedPlayer: vi.fn(),
        toggleSelect: vi.fn(),
        commitHintReady: false,
        commitKeywordReady: false,
        commitHint: vi.fn(),
        commitKeyword: vi.fn(),
        setVerdict: vi.fn(),
        send: vi.fn(),
        hetLuot: vi.fn(),
        backToLobby: vi.fn(),
        pickQuestion: vi.fn(),
        byId: () => null,
        verdictOf: () => null,
        watchRunning: false,
        watchMs: 0,
        toggleWatch: vi.fn(),
        flash: null,
        openRounds: vi.fn(),
        openAdjust: vi.fn(),
        ...over,
    }
}

/** Render a round through its registry module — the path production takes. */
function renderRound(
    roundId: string,
    over: Partial<ConsoleFacts> = {},
    projection: Partial<LiveResponse["projection"]> = {},
    mc: unknown = null,
    questions: LiveResponse["questions"] = [],
): ConsoleFacts {
    const f = facts(over, projection, mc, questions)
    const mod = roundModuleOf(roundId)
    if (!mod) throw new Error(`no round module for "${roundId}"`)
    render(mod.render(f))
    return f
}

const openQ = { questionId: "q1", deadlineAt: null, question: null }

const veDichMc = (over: Partial<VeDichConsole> = {}): VeDichConsole => ({
    phase: 1,
    turnPlayerId: "u1",
    openStage: "current",
    answererId: "u1",
    buzzerId: null,
    buzzerMs: null,
    assignedToId: null,
    power: null,
    pendingQuestionId: null,
    stagedPower: null,
    turnPowerUsed: false,
    ...over,
})

describe("KhoiDongRieng — S1, the oral run", () => {
    it("shows the stopwatch strip and sends the run's verdict", async () => {
        const user = userEvent.setup()
        const f = renderRound("khoi-dong", {}, {
            oral: { questionId: "q1", question: null, playerId: "u1", index: 0, total: 6, elapsedS: 10, budgetS: 45 },
        })

        expectButtonsInOrder(["Tính giờ", "Đúng", "Sai", "Về sảnh"])
        await user.click(screen.getByRole("button", { name: "Đúng" }))
        expect(f.send).toHaveBeenCalledWith({ kind: "khoi-dong.recordOral", correct: true, spentS: 0 })
        await user.click(screen.getByRole("button", { name: "Về sảnh" }))
        expect(f.backToLobby).toHaveBeenCalledOnce()
    })

    it("locks Đúng/Sai while no run is open, and once the budget is blown", () => {
        const mod = roundModuleOf("khoi-dong")!
        const { rerender } = render(mod.render(facts()))
        expect(screen.queryByRole("button", { name: "Đúng" })).toBeNull()
        expect(screen.getByRole("button", { name: "Về sảnh" })).toBeInTheDocument()

        // overBudget reads the console's stopwatch: 6s watched into a 5s budget left
        rerender(mod.render(facts(
            { watchMs: 6_000 },
            { oral: { questionId: "q1", question: null, playerId: "u1", index: 2, total: 6, elapsedS: 40, budgetS: 45 } },
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

        // a window is already running → nothing to open (the engine would
        // refuse a second press anyway; the button says so by being inert)
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
        expect(f.send).toHaveBeenCalledWith({ kind: "khoi-dong.judge", playerId: "u2", correct: true })

        await user.click(screen.getByText("Sai", BUTTON))
        expect(f.send).toHaveBeenCalledWith({ kind: "khoi-dong.judge", playerId: "u2", correct: false })
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

        // the strip runs 1..6; on question 2 (index 1) only 3 moves it on
        await user.click(screen.getByRole("button", { name: "3" }))
        expect(f.send).toHaveBeenCalledWith({ kind: "khoi-dong.nextQuestion" })

        await user.click(screen.getByRole("button", { name: "1" }))
        expect(f.send).toHaveBeenCalledTimes(1)
    })

    it("Hiện đáp án reveals the question in play — inert with nothing on screen", async () => {
        const user = userEvent.setup()
        const mod = roundModuleOf("khoi-dong")!
        const f = facts({ stage: "phase2" }, { open: [q1] }, batch())
        const { rerender } = render(mod.render(f))

        await user.click(screen.getByRole("button", { name: "Hiện đáp án" }))
        expect(f.send).toHaveBeenCalledWith({ kind: "reveal.answer", questionId: "q1" })

        // no question in play → the slot is a display chip, not a button
        rerender(mod.render(facts({ stage: "phase2" }, { open: [] }, batch())))
        expect(screen.queryByRole("button", { name: "Hiện đáp án" })).toBeNull()
    })
})

describe("GiaiMa — S3", () => {
    const BUTTON = { selector: "button" } as const

    it("commits are inert until a submitted player is selected", () => {
        renderRound("giai-ma")                 // defaults: nothing selected
        // both commits render as inert slots — not clickable
        expect(screen.queryByText("Đúng", BUTTON)).toBeNull()
        expect(screen.queryByText("Đúng từ khoá", BUTTON)).toBeNull()
        expect(screen.getByText("Sai")).toBeInTheDocument()      // old button stays, inert
        expect(screen.queryByRole("button", { name: "Sai" })).toBeNull()
    })

    it("Đúng commits the hint verdicts when ready; Sai stays inert", async () => {
        const user = userEvent.setup()
        const f = renderRound("giai-ma", {
            commitHintReady: true,
            commitKeywordReady: true,        // both buttons live for the order check
        }, { open: [openQ] })

        expectButtonsInOrder(["Đúng", "Đúng từ khoá", "Về sảnh"])
        await user.click(screen.getByText("Đúng", BUTTON))
        expect(f.commitHint).toHaveBeenCalledOnce()
        expect(f.commitKeyword).not.toHaveBeenCalled()
        expect(screen.getByText("Sai")).toBeInTheDocument()
        expect(screen.queryByRole("button", { name: "Sai" })).toBeNull()
    })

    it("Đúng từ khoá commits the keyword judgments when ready", async () => {
        const user = userEvent.setup()
        const f = renderRound("giai-ma", { commitKeywordReady: true })

        await user.click(screen.getByText("Đúng từ khoá", BUTTON))
        expect(f.commitKeyword).toHaveBeenCalledOnce()
        expect(f.commitHint).not.toHaveBeenCalled()
    })

    it("Hiện đáp án — gợi ý targets the hint on the table; từ khoá has its own", async () => {
        const user = userEvent.setup()
        const keyword = {
            _id: "kw", roundId: "giai-ma", turnId: "keyword", position: 0,
            kind: "KEYWORD" as const, questionText: "Từ khoá", timeLimit: null, points: 100,
            payload: {},
        }
        const f = renderRound(
            "giai-ma", {}, {},
            { hintsRemaining: ["h2"], hintsPicked: ["h1"], openHintId: null, players: [] },
            [keyword],
        )

        // the last judged hint is the one on the table → its answer reveals
        await user.click(screen.getByRole("button", { name: "Hiện đáp án gợi ý" }))
        expect(f.send).toHaveBeenCalledWith({ kind: "reveal.answer", questionId: "h1" })

        // …and the keyword has no window to wait for — the desk decides
        await user.click(screen.getByRole("button", { name: "Hiện đáp án từ khoá" }))
        expect(f.send).toHaveBeenCalledWith({ kind: "reveal.answer", questionId: "kw" })
    })

    it("Hiện đáp án gợi ý is inert before the first hint", () => {
        renderRound("giai-ma", {}, {}, {
            hintsRemaining: ["h1"], hintsPicked: [], openHintId: null, players: [],
        })
        expect(screen.queryByRole("button", { name: "Hiện đáp án gợi ý" })).toBeNull()
    })

    it("draws the fixed EIGHT-tile board, whatever the round's hint count", () => {
        // Six hints in this round → six live tiles, two inert ones: the grid never
        // shrinks, so a viewer cannot read the hint count off the layout.
        const hints = Array.from({ length: 6 }, (_, i) => ({
            _id: `h${i + 1}`,
            roundId: "giai-ma",
            kind: "TEXT" as const,
            position: i + 1,
            questionText: `gợi ý ${i + 1}`,
            points: 0,
            timeLimit: 15,
            payload: {},
        }))
        const keyword = {
            _id: "k1",
            roundId: "giai-ma",
            kind: "KEYWORD" as const,
            position: 9,
            questionText: "từ khoá",
            points: 0,
            timeLimit: null,
            payload: { code: "BONTUONG" },
        }
        const f = renderRound("giai-ma", {}, {}, null, [...hints, keyword] as unknown as LiveResponse["questions"])
        const tiles = screen.getAllByText(/^[1-8]$/)
        expect(tiles).toHaveLength(8)
        // 1..6 are this round's hints (open-able); 7 and 8 exist but stay inert
        expect(tiles.slice(0, 6).every((tile) => tile.getAttribute("role") === "button")).toBe(true)
        expect(tiles.slice(6).map((tile) => tile.getAttribute("role"))).toEqual([null, null])
        // the keyword length is announced from the code ("BONTUONG" = 8 letters)
        expect(screen.getByText(/8 chữ cái/)).toBeInTheDocument()
        expect(f.remaining).toBe(30)
    })

    it("the rail cards toggle the selection (multi-select)", async () => {
        const user = userEvent.setup()
        const f = renderRound("giai-ma", {
            baseCards: [
                { id: "u1", name: "An", points: 10 },
                { id: "u2", name: "Bình", points: 5 },
            ],
        }, { open: [openQ] })
        await user.click(screen.getByText("An"))
        await user.click(screen.getByText("Bình"))
        expect(f.toggleSelect).toHaveBeenCalledWith("u1")
        expect(f.toggleSelect).toHaveBeenCalledWith("u2")
    })
})

describe("VeDichRieng — the powers and the duel", () => {
    const BUTTON = { selector: "button" } as const
    const opened = { open: [openQ] }

    // The pick board with the turn's three already staged (pending) — the state
    // the power row is live in: pre-open, one decision to make.
    const pickBoard = {
        open: [],
        board: [{ questionId: "a", value: 40, where: "pending" as const }],
    }
    const stagedQuestion = {
        _id: "a", roundId: "ve-dich", turnId: "phase-2", position: 1,
        kind: "TEXT" as const, questionText: "câu a", timeLimit: 30, points: 40, payload: {},
    }

    it("the power row lives on the pick board — pressed BEFORE the question opens", async () => {
        const user = userEvent.setup()
        const f = renderRound(
            "ve-dich", {}, pickBoard,
            veDichMc({ phase: 2, turnPlayerId: "u1", pendingQuestionId: "a" }),
            [stagedQuestion],
        )

        // Ngôi sao hy vọng stages for the turn player — the turn's ONE pick,
        // nothing spent yet (the server locks the row after this press)
        await user.click(screen.getByText("Ngôi sao hy vọng", BUTTON))
        expect(f.send).toHaveBeenCalledWith({
            kind: "ve-dich.declarePower", playerId: "u1", power: "STAR",
        })
    })

    it("Không dùng quyền năng sends the explicit none — never a pick", async () => {
        const user = userEvent.setup()
        const f = renderRound(
            "ve-dich", {}, pickBoard,
            veDichMc({ phase: 2, turnPlayerId: "u1", pendingQuestionId: "a" }),
            [stagedQuestion],
        )

        await user.click(screen.getByText("Không dùng quyền năng", BUTTON))
        expect(f.send).toHaveBeenCalledWith({
            kind: "ve-dich.declarePower", playerId: "u1", power: null,
        })
    })

    it("Chỉ định đối kháng is inert without the selected card", () => {
        renderRound(
            "ve-dich", {}, pickBoard,
            veDichMc({ phase: 2, turnPlayerId: "u1", pendingQuestionId: "a" }),
            [stagedQuestion],
        )
        expect(screen.queryByText("Chỉ định đối kháng", BUTTON)).toBeNull()
        expect(screen.getByText("Chỉ định đối kháng")).toBeInTheDocument()   // still drawn, as a slot
    })

    it("Chỉ định đối kháng sends the SELECTED card as the target", async () => {
        const user = userEvent.setup()
        const f = renderRound(
            "ve-dich", { target: "u2" }, pickBoard,
            veDichMc({ phase: 2, turnPlayerId: "u1", pendingQuestionId: "a" }),
            [stagedQuestion],
        )
        await user.click(screen.getByText("Chỉ định đối kháng", BUTTON))
        expect(f.send).toHaveBeenCalledWith({
            kind: "ve-dich.declarePower", playerId: "u1", power: "ASSIGN", targetId: "u2",
        })
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

    it("one power per turn: the row goes inert once the turn spent one", () => {
        renderRound(
            "ve-dich", {}, pickBoard,
            veDichMc({ phase: 2, turnPlayerId: "u1", pendingQuestionId: "a", turnPowerUsed: true }),
            [stagedQuestion],
        )
        expect(screen.queryByRole("button", { name: "Ngôi sao hy vọng" })).toBeNull()
        expect(screen.queryByRole("button", { name: "Chỉ định đối kháng" })).toBeNull()
        expect(screen.queryByRole("button", { name: "Không dùng quyền năng" })).toBeNull()
        // …and the chip says why: the turn is done spending
        expect(screen.getByText("đã chốt lượt này")).toBeInTheDocument()
    })

    it("during a duel the buzz slot is inert — an ASSIGN question has nothing to close", () => {
        renderRound("ve-dich", {}, opened, veDichMc({ phase: 2, power: "ASSIGN", assignedToId: "u2" }))
        expect(screen.queryByText("Mở chuông", BUTTON)).toBeNull()
        expect(screen.getByText("Mở chuông")).toBeInTheDocument()      // still drawn, as a slot
    })

    it("a live race can be ended: Khoá chuông sends the lock", async () => {
        const user = userEvent.setup()
        const f = renderRound("ve-dich", {}, opened, veDichMc({
            phase: 2, power: "ASSIGN", assignedToId: "u2", openStage: "buzz"
        }))

        await user.click(screen.getByText("Khoá chuông", BUTTON))
        expect(f.send).toHaveBeenCalledWith({ kind: "ve-dich.lockBuzz" })
    })

    it("the lock is inert once someone buzzed — the race is already settled", () => {
        renderRound("ve-dich", {}, opened, veDichMc({
            phase: 2, power: "ASSIGN", openStage: "buzz", buzzerId: "u2"
        }))
        expect(screen.queryByText("Khoá chuông", BUTTON)).toBeNull()
        expect(screen.getByText("Khoá chuông")).toBeInTheDocument()
    })

    it("before the duel, Mở chuông is a real button", () => {
        renderRound("ve-dich", {}, opened, veDichMc({ phase: 2 }))
        expect(screen.getByText("Mở chuông", BUTTON)).toBeInTheDocument()
    })
});

describe("ButPha — S4", () => {
    it("Tính giờ opens the sprint, Về sảnh ends the round", async () => {
        const user = userEvent.setup()
        const f = renderRound("but-pha", { send: vi.fn() })

        expectButtonsInOrder(["Tính giờ", "Về sảnh"])
        await user.click(screen.getByRole("button", { name: "Tính giờ" }))
        expect(f.pickQuestion).toHaveBeenCalledOnce()
        await user.click(screen.getByRole("button", { name: "Về sảnh" }))
        expect(f.backToLobby).toHaveBeenCalledOnce()
    })

    it("Hiện đáp án reveals the cursor's question once it has been asked", async () => {
        const user = userEvent.setup()
        const f = renderRound("but-pha", { send: vi.fn() }, {}, { questionId: "q1", opened: true })

        await user.click(screen.getByRole("button", { name: "Hiện đáp án" }))
        expect(f.send).toHaveBeenCalledWith({ kind: "reveal.answer", questionId: "q1" })
    })

    it("…and stays inert before the clock ever starts", () => {
        renderRound("but-pha", {}, {}, { questionId: "q1", opened: false })
        expect(screen.queryByRole("button", { name: "Hiện đáp án" })).toBeNull()
    })
})

describe("VeDichPick — S5/S6, the board", () => {
    const veQuestion = (id: string, points: number) => ({
        _id: id,
        roundId: "ve-dich",
        turnId: "phase-1",
        position: 1,
        kind: "TEXT" as const,
        questionText: `Câu ${id}`,
        timeLimit: null,
        points,
        payload: {},
    })
    const freeCell = (id: string, value: number) => ({ questionId: id, value, where: "free" as const })

    it("the console picks for the turn player — either band: a 20 while 30s are free", async () => {
        const user = userEvent.setup()
        const f = renderRound(
            "ve-dich",
            {},
            { open: [], board: [freeCell("q30", 30), freeCell("q20", 20)] },
            veDichMc({ phase: 1, turnPlayerId: "u1" }),
            [veQuestion("q30", 30), veQuestion("q20", 20)],
        )

        // BOTH bands are stageable — the show allows a 20 or a 30 in any order
        expect(screen.getAllByTitle("Chọn câu này")).toHaveLength(2)
        await user.click(screen.getByRole("button", { name: "20" }))   // the lower band's cell
        await user.click(screen.getByRole("button", { name: "Chọn câu này" }))  // the strip confirm
        expect(f.send).toHaveBeenCalledWith({ kind: "ve-dich.pick", playerId: "u1", questionId: "q20" })
    })

    it("phase 2: stage three cells — Chốt sends the batch for the turn player", async () => {
        const user = userEvent.setup()
        const f = renderRound(
            "ve-dich",
            {},
            { open: [], board: [freeCell("a", 40), freeCell("b", 40), freeCell("c", 40)] },
            veDichMc({ phase: 2, turnPlayerId: "u1" }),
            [veQuestion("a", 40), veQuestion("b", 40), veQuestion("c", 40)],
        )

        for (const cell of screen.getAllByTitle("Chọn câu này")) {
            await user.click(cell)
        }
        await user.click(screen.getByRole("button", { name: "Chốt 3 câu" }))
        expect(f.send).toHaveBeenCalledWith({
            kind: "ve-dich.pickBatch", playerId: "u1", questionIds: ["a", "b", "c"],
        })
    })

    it("no turn player, no pick — the confirm slot stays inert", () => {
        renderRound(
            "ve-dich",
            {},
            { open: [], board: [freeCell("q30", 30)] },
            veDichMc({ phase: 1, turnPlayerId: null }),
            [veQuestion("q30", 30)],
        )
        expect(screen.queryByRole("button", { name: "Chọn câu này" })).toBeNull()
        expect(screen.getByTitle("còn trống")).toBeInTheDocument()
    })

    it("phase 1: Bắt đầu jumps to phase 2, Chọn lại skips the pick", async () => {
        const user = userEvent.setup()
        const f = renderRound("ve-dich", { send: vi.fn() }, {}, veDichMc({ phase: 1 }))

        expectButtonsInOrder(["Bắt đầu", "Chọn lại", "Về sảnh"])
        await user.click(screen.getByRole("button", { name: "Bắt đầu" }))
        expect(f.send).toHaveBeenCalledWith({ kind: "ve-dich.beginPhase2" })
        await user.click(screen.getByRole("button", { name: "Chọn lại" }))
        expect(f.send).toHaveBeenCalledWith({ kind: "ve-dich.advanceTurn" })
    })

    it("phase 2: Bắt đầu opens the question the student picked", async () => {
        const user = userEvent.setup()
        const f = renderRound("ve-dich", { send: vi.fn() }, {}, veDichMc({ phase: 2, pendingQuestionId: "q9" }))

        await user.click(screen.getByRole("button", { name: "Bắt đầu" }))
        expect(f.send).toHaveBeenCalledWith({ kind: "ve-dich.openQuestion", questionId: "q9" })
    })
})

describe("VeDichChung — S7, phase 1 question", () => {
    it("keeps Hết lượt locked while the answerer has no verdict", () => {
        renderRound("ve-dich", { target: "u1" }, { open: [openQ] }, veDichMc({ phase: 1 }))
        expect(screen.queryByRole("button", { name: "Hết lượt" })).toBeNull()
    })

    it("unlocks Hết lượt with the verdict — and strip buttons carry no tooltips", async () => {
        const user = userEvent.setup()
        const f = renderRound(
            "ve-dich",
            { hetLuot: vi.fn(), target: "u1", verdictOf: () => "CORRECT" },
            { open: [openQ] },
            veDichMc({ phase: 1 }),
        )

        expectButtonsInOrder(["Đúng", "Sai", "Hết lượt", "Về sảnh"])
        const het = screen.getByRole("button", { name: "Hết lượt" })
        await user.click(het)
        expect(f.hetLuot).toHaveBeenCalledOnce()
        // tooltips are gone (user decision): the buttons carry no title
        expect(het).not.toHaveAttribute("title")
        expect(screen.getByRole("button", { name: "Về sảnh" })).not.toHaveAttribute("title")
    })

    it("Hiện đáp án reveals the open question's answer", async () => {
        const user = userEvent.setup()
        const f = renderRound("ve-dich", {}, { open: [openQ] }, veDichMc({ phase: 1 }))

        await user.click(screen.getByRole("button", { name: "Hiện đáp án" }))
        expect(f.send).toHaveBeenCalledWith({ kind: "reveal.answer", questionId: "q1" })
    })
})

describe("VeDichRieng — S8, phase 2 question", () => {
    it("offers the full turn strip: chuông, verdicts, hết lượt, về sảnh", async () => {
        const user = userEvent.setup()
        const f = renderRound(
            "ve-dich",
            { send: vi.fn(), hetLuot: vi.fn(), target: "u1", verdictOf: () => "CORRECT" },
            { open: [openQ] },
            veDichMc({ phase: 2 }),
        )

        expectButtonsInOrder(["Mở chuông", "Đúng", "Sai", "Hết lượt", "Về sảnh"])
        await user.click(screen.getByRole("button", { name: "Mở chuông" }))
        expect(f.send).toHaveBeenCalledWith({ kind: "ve-dich.closeCurrentAnswer" })
        await user.click(screen.getByRole("button", { name: "Hết lượt" }))
        expect(f.hetLuot).toHaveBeenCalledOnce()
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

/** The clickable labels in DOM order — real buttons + role=button divs (tiles). */
function clickables(): string[] {
    return Array.from(document.querySelectorAll('button, [role="button"]')).map((el) => el.textContent ?? "")
}

/** Assert the given labels appear on screen in exactly this relative order. */
function expectButtonsInOrder(expected: string[]) {
    const actual = clickables()
    let cursor = -1
    for (const label of expected) {
        const at = actual.indexOf(label, cursor + 1)
        expect(at, `"${label}" missing after index ${cursor} — got [${actual.join(" · ")}]`).toBeGreaterThan(cursor)
        cursor = at
    }
}

// score adjust's ± chip was removed from the controller's rail (the console's call) —
// the dialog/machinery stays dormant; no UI asserts it any more.

