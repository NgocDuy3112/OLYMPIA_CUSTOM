import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import type { ConsoleFacts } from "@/components/stage/deck"
import type { LiveResponse, VeDichConsole } from "@/lib/live"
import { roundModuleOf } from "@/rounds"

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
            hintAnswers: {},
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
        peerControls: new Map(),
        judgingId: null,
        target: null,
        setSelectedQ: vi.fn(),
        setSelectedPlayer: vi.fn(),
        toggleSelect: vi.fn(),
        selectedIds: new Set<string>(),
        commitHintReady: false,
        commitKeywordReady: false,
        commitHint: vi.fn(),
        commitKeyword: vi.fn(),
        setVerdict: vi.fn(),
        send: vi.fn(),
        sendChain: vi.fn(),
        hetLuot: vi.fn(),
        backToLobby: vi.fn(),
        pickQuestion: vi.fn(),
        byId: () => null,
        verdictOf: () => null,
        oralRemaining: null,
        keywordRemaining: null,
        flash: null,
        openAdjust: vi.fn(),
        openRegrade: vi.fn(),
        ...over,
    }
}

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
    turnPicked: 0,
    ...over,
})

describe("KhoiDongRieng — S1, the oral run", () => {
    it("shows the stopwatch strip and sends the run's verdict", async () => {
        const user = userEvent.setup()
        const f = renderRound("khoi-dong", {
            baseCards: [{ id: "u1", name: "An", points: 10 }],
            oralRemaining: 30,
        }, {
            oral: { questionId: "q1", question: null, playerId: "u1", index: 0, total: 6, elapsedS: 10, budgetS: 45, deadlineAt: "2026-01-01T00:00:40.000Z" },
        })

        await user.click(screen.getByText("An"))
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
        renderRound("khoi-dong", {}, { oral: null })

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
                kind: "TEXT",
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
                payload: {},
            }]
        )

        expect(screen.queryByText("Câu hỏi từ danh sách")).toBeNull()
    })

    it("Tính giờ tells the engine to reveal the question — only after a player is marked", async () => {
        const user = userEvent.setup()
        const f = renderRound("khoi-dong", {
            baseCards: [{ id: "u1", name: "An", points: 10 }],
        }, oralRun)

        expect(screen.queryByRole("button", { name: "Tính giờ" })).toBeNull()
        await user.click(screen.getByText("An"))
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
            baseCards: [{ id: "u1", name: "An", points: 10 }, { id: "u2", name: "Bình", points: 5 }],
            oralRemaining: 30,
        }, {
            oral: { questionId: "q1", question: null, playerId: "u1", index: 0, total: 6, elapsedS: 10, budgetS: 45, deadlineAt: "2026-01-01T00:00:40.000Z" },
        })

        await user.click(screen.getByText("Bình"))
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

        await user.click(screen.getAllByRole("button", { name: "3" })[0]!)
        expect(f.send).toHaveBeenCalledWith({ kind: "khoi-dong.nextQuestion" })

        await user.click(screen.getAllByRole("button", { name: "1" })[0]!)
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

describe("GiaiMa — S3", () => {
    const BUTTON = { selector: "button" } as const

    it("commits are inert until a submitted player is selected", () => {
        renderRound("giai-ma")                 
        expect(screen.queryByText("Đúng", BUTTON)).toBeNull()
        expect(screen.queryByText("Đúng từ khoá", BUTTON)).toBeNull()
        expect(screen.queryByRole("button", { name: "Sai" })).toBeNull()
    })

    it("Đúng commits the hint verdicts when ready; Sai stays inert", async () => {
        const user = userEvent.setup()
        const f = renderRound("giai-ma", {
            commitHintReady: true,
            commitKeywordReady: true,
        }, { open: [openQ] })

        expectButtonsInOrder(["Đúng", "Đúng từ khoá", "Về sảnh"])
        await user.click(screen.getByText("Đúng", BUTTON))
        expect(f.commitHint).toHaveBeenCalledOnce()
        expect(f.commitKeyword).not.toHaveBeenCalled()
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

        await user.click(screen.getByRole("button", { name: "Hiện đáp án gợi ý" }))
        expect(f.send).toHaveBeenCalledWith({ kind: "reveal.answer", questionId: "h1" })

        await user.click(screen.getByRole("button", { name: "Hiện đáp án từ khoá" }))
        expect(f.send).toHaveBeenCalledWith({ kind: "reveal.answer", questionId: "kw" })
    })

    it("Hiện đáp án gợi ý is inert before the first hint", () => {
        renderRound("giai-ma", {}, {}, {
            hintsRemaining: ["h1"], hintsPicked: [], openHintId: null, players: [],
        })
        expect(screen.queryByRole("button", { name: "Hiện đáp án gợi ý" })).toBeNull()
    })

    it("Đếm giờ is armed in the gap between the pick and the window", async () => {
        const user = userEvent.setup()
        const f = renderRound("giai-ma", {}, {}, {
            hintsRemaining: ["h2"], hintsPicked: ["h1"], openHintId: "h1",
            windowOpen: false, players: [],
        })

        await user.click(screen.getByRole("button", { name: "Đếm giờ" }))
        expect(f.send).toHaveBeenCalledWith({ kind: "giai-ma.startWindow" })
    })

    it("Đếm giờ goes inert while the 15 s is already running", () => {
        renderRound("giai-ma", {}, {}, {
            hintsRemaining: ["h2"], hintsPicked: ["h1"], openHintId: "h1",
            windowOpen: true, players: [],
        })
        expect(screen.queryByRole("button", { name: "Đếm giờ" })).toBeNull()
    })

    it("draws the fixed EIGHT-tile board, whatever the round's hint count", () => {
        const hints = Array.from({ length: 6 }, (_, i) => ({
            _id: `h${i + 1}`,
            roundId: "giai-ma",
            kind: "TEXT" as const,
            position: i + 1,
            questionText: `gợi ý ${i + 1}`,
            points: 0,
            payload: {},
        }))
        const keyword = {
            _id: "k1",
            roundId: "giai-ma",
            kind: "KEYWORD" as const,
            position: 9,
            questionText: "từ khoá",
            points: 0,
            payload: { code: "BONTUONG" },
        }
        const f = renderRound(
            "giai-ma",
            {},
            { keywordLength: 8, keywordKind: "letters" },
            null,
            [...hints, keyword] as unknown as LiveResponse["questions"],
        )
        const tiles = screen.getAllByText(/^[1-8]$/, { selector: "span" })
        expect(tiles).toHaveLength(8)
        expect(tiles.slice(0, 6).every((tile) => tile.closest("[role='button']") !== null)).toBe(true)
        expect(tiles.slice(6).map((tile) => tile.getAttribute("role"))).toEqual([null, null])
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

    const pickBoard = {
        open: [],
        board: [{ questionId: "a", value: 40, where: "pending" as const }],
    }
    const stagedQuestion = {
        _id: "a", roundId: "ve-dich", turnId: "phase-2", position: 1,
        kind: "TEXT" as const, questionText: "câu a", timeLimit: 30, points: 40, payload: {},
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

    it("one power per turn: the buttons go inert once the turn spent one", () => {
        renderRound(
            "ve-dich", {}, opened,
            veDichMc({ phase: 2, turnPlayerId: "u1", pendingQuestionId: "a", turnPowerUsed: true }),
            [stagedQuestion],
        )
        expect(screen.queryByRole("button", { name: "Ngôi sao hy vọng" })).toBeNull()
        expect(screen.queryByRole("button", { name: "Chỉ định đối kháng" })).toBeNull()
        expect(screen.getByText("đã chốt")).toBeInTheDocument()
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
        renderRound("ve-dich", {}, opened, veDichMc({ phase: 2, clockStarted: true }))
        expect(screen.getByText("Mở chuông", BUTTON)).toBeInTheDocument()
    })
});

const butPhaQuestions: LiveResponse["questions"] = [0, 1, 2, 3].map((i) => ({
    _id: `bp-${i + 1}`,
    kind: "TEXT",
    roundId: "but-pha",
    turnId: "phase1",
    position: i,
    questionText: `Câu hỏi BP ${i + 1}`,
    points: 10,
    payload: {},
}))

const byButPhaId = (id: string) => butPhaQuestions.find((q) => q._id === id) ?? null

describe("ButPha — S4", () => {
    it("Tính giờ starts the revealed question's clock, Về sảnh ends the round", async () => {
        const user = userEvent.setup()
        const f = renderRound(
            "but-pha",
            { send: vi.fn() },
            { open: [openQ] },
            { questionId: "q1", opened: true, clockStarted: false },
        )

        expectButtonsInOrder(["Tính giờ", "Về sảnh"])
        await user.click(screen.getByRole("button", { name: "Tính giờ" }))
        expect(f.send).toHaveBeenCalledWith({ kind: "but-pha.startClock" })
        await user.click(screen.getByRole("button", { name: "Về sảnh" }))
        expect(f.backToLobby).toHaveBeenCalledOnce()
    })

    it("clicking a question chip reveals the next question", async () => {
        const user = userEvent.setup()
        const f = renderRound("but-pha", { pickQuestion: vi.fn() })

        await user.click(screen.getByRole("button", { name: "1" }))
        expect(f.pickQuestion).toHaveBeenCalledOnce()
    })

    it("Đáp án thí sinh reveals the cursor's question once it has been asked", async () => {
        const user = userEvent.setup()
        const f = renderRound("but-pha", { send: vi.fn() }, {}, { questionId: "q1", opened: true })

        await user.click(screen.getByRole("button", { name: "Đáp án thí sinh" }))
        expect(f.send).toHaveBeenCalledWith({ kind: "reveal.answer", questionId: "q1" })
    })

    it("…and stays inert before the clock ever starts", () => {
        renderRound("but-pha", {}, {}, { questionId: "q1", opened: false })
        expect(screen.queryByRole("button", { name: "Đáp án thí sinh" })).toBeNull()
    })

    it("while a question is open, the NEXT chip is the clickable one", async () => {
        const user = userEvent.setup()
        const f = renderRound(
            "but-pha",
            { pickQuestion: vi.fn(), byId: byButPhaId },
            { open: [{ questionId: "bp-1", deadlineAt: null, question: null }] },
            { questionId: "bp-1", opened: true, clockStarted: true },
            butPhaQuestions,
        )

        expect(screen.queryByRole("button", { name: "1" })).toBeNull()
        await user.click(screen.getByRole("button", { name: "2" }))
        expect(f.pickQuestion).toHaveBeenCalledOnce()
    })

    it("the open question's own chip is the current one (0-based position)", () => {
        renderRound(
            "but-pha",
            { byId: byButPhaId },
            { open: [{ questionId: "bp-2", deadlineAt: null, question: null }] },
            { questionId: "bp-2", opened: true, clockStarted: true },
            butPhaQuestions,
        )

        const current = document.querySelector('[aria-current="step"]')
        expect(current?.textContent).toBe("2")
    })

    it("on the LAST question the current chip itself closes it", async () => {
        const user = userEvent.setup()
        const f = renderRound(
            "but-pha",
            { pickQuestion: vi.fn(), byId: byButPhaId },
            { open: [{ questionId: "bp-4", deadlineAt: null, question: null }] },
            { questionId: "bp-4", opened: true, clockStarted: true },
            butPhaQuestions,
        )

        await user.click(screen.getByRole("button", { name: "4" }))
        expect(f.pickQuestion).toHaveBeenCalledOnce()
    })

    it("once the round ends every chip reads done and nothing is clickable", () => {
        renderRound("but-pha", {}, { stage: "ended" })

        expect(screen.queryByRole("button", { name: "1" })).toBeNull()
        expect(screen.getByText("✓1")).toBeInTheDocument()
        expect(screen.getByText("✓4")).toBeInTheDocument()
    })
})

const TWO_PLAYERS = [
    { id: "u1", displayName: "An", points: 10, rank: 1 },
    { id: "u2", displayName: "Bình", points: 0, rank: 2 },
]

const THREE_PLAYERS = [
    ...TWO_PLAYERS,
    { id: "u3", displayName: "Cúc", points: 5, rank: 3 },
]

const answerRow = (userId: string, verdict: "CORRECT" | "INCORRECT" | null) => ({
    questionId: "q1",
    userId,
    value: { text: "đáp án" },
    verdict,
    judged: verdict !== null,
    pointsAwarded: verdict === "CORRECT" ? 20 : 0,
})

describe("VeDichPick — S5/S6, the board", () => {
    const veQuestion = (id: string, points: number) => ({
        _id: id,
        roundId: "ve-dich",
        turnId: "phase-1",
        position: 1,
        kind: "TEXT" as const,
        questionText: `Câu ${id}`,
        points,
        payload: {},
    })
    const freeCell = (id: string, value: number) => ({ questionId: id, value, where: "free" as const })

it("phase 1: clicking a value cell random-picks one question of that value", async () => {
        const user = userEvent.setup()
        const f = renderRound(
            "ve-dich",
            {},
            { open: [], board: [freeCell("q30", 30), freeCell("q20", 20)], table: TWO_PLAYERS },
            veDichMc({ phase: 1, turnPlayerId: "u1" }),
            [veQuestion("q30", 30), veQuestion("q20", 20)],
        )

        await user.click(screen.getByTitle("Chọn ngẫu nhiên 1 câu 20"))
        expect(f.send).not.toHaveBeenCalled()
        await user.click(screen.getByTitle("Chọn ngẫu nhiên 1 câu 30"))

        await user.click(screen.getByRole("button", { name: "Xác nhận" }))
        expect(f.send).toHaveBeenCalledWith({
            kind: "ve-dich.pickRound",
            questionIds: ["q20", "q30"],
        })
    })

    it("phase 1: Xác nhận waits for the full N — one pick per player", async () => {
        const user = userEvent.setup()
        renderRound(
            "ve-dich",
            {},
            {
                open: [],
                board: [freeCell("a", 20), freeCell("b", 30), freeCell("c", 20)],
                table: THREE_PLAYERS,
            },
            veDichMc({ phase: 1, turnPlayerId: "u1" }),
            [veQuestion("a", 20), veQuestion("b", 30), veQuestion("c", 20)],
        )

        await user.click(screen.getByTitle("Chọn ngẫu nhiên 1 câu 20"))
        expect(screen.queryByRole("button", { name: "Xác nhận" })).toBeNull()
        await user.click(screen.getByTitle("Chọn ngẫu nhiên 1 câu 30"))
        expect(screen.queryByRole("button", { name: "Xác nhận" })).toBeNull()
        await user.click(screen.getByTitle("Chọn ngẫu nhiên 1 câu 20"))
        expect(screen.getByRole("button", { name: "Xác nhận" })).toBeInTheDocument()
    })

    it("phase 2: each cell click writes the batch for the turn player", async () => {
        const user = userEvent.setup()
        const f = renderRound(
            "ve-dich",
            {},
            { open: [], board: [freeCell("a", 40), freeCell("b", 40), freeCell("c", 40)] },
            veDichMc({ phase: 2, turnPlayerId: "u1" }),
            [veQuestion("a", 40), veQuestion("b", 40), veQuestion("c", 40)],
        )

        expect(screen.queryByRole("button", { name: "Chốt 3 câu" })).toBeNull()

        for (let i = 0; i < 3; i++) {
            await user.click(screen.getByTitle("Chọn ngẫu nhiên 1 câu 40"))
        }
        const call = (f.send as unknown as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0]
        expect(call.kind).toBe("ve-dich.pickBatch")
        expect(call.questionIds).toHaveLength(3)
        expect(new Set(call.questionIds).size).toBe(3)
        for (const id of call.questionIds) expect(["a", "b", "c"]).toContain(id)
    })

it("phase 1: a value with no free question is inert", () => {
        renderRound(
            "ve-dich",
            {},
            { open: [], board: [freeCell("q30", 30)], table: TWO_PLAYERS },
            veDichMc({ phase: 1, turnPlayerId: null }),
            [veQuestion("q30", 30)],
        )

        expect(screen.getAllByTitle("Hết câu 20")).toHaveLength(1)
        expect(screen.getAllByTitle("Chọn ngẫu nhiên 1 câu 30")).toHaveLength(1)
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

    it("phase 2: Xác nhận waits for the whole turn — three questions, one turn", () => {
        renderRound("ve-dich", {}, {
            open: [],
            board: [
                { questionId: "q9", value: 40, where: "pending" as const },
                { questionId: "q10", value: 40, where: "pending" as const },
            ],
        }, veDichMc({ phase: 2, pendingQuestionId: "q9", turnPicked: 2 }))

        expect(screen.getByText("Xác nhận")).toBeInTheDocument()
        expect(screen.queryByRole("button", { name: "Xác nhận" })).toBeNull()
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

    it("the board carries one chip per staged pick — N, not a fixed 4", () => {
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
            },
            veDichMc({ phase: 1 }),
        )

        expect(screen.getAllByRole("button", { name: "20" })).toHaveLength(2)
        expect(screen.getAllByRole("button", { name: "30" })).toHaveLength(1)
        expect(screen.queryByRole("button", { name: "Xác nhận" })).toBeNull()
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

it("keeps Hết lượt locked while an answer is still unjudged", () => {
        renderRound(
            "ve-dich",
            { rows: [answerRow("u1", null)] },
            { open: [openQ] },
            veDichMc({ phase: 1 }),
        )
        expect(screen.queryByRole("button", { name: "Hết lượt" })).toBeNull()
    })

it("unlocks Hết lượt once every answer is judged — and strip buttons carry no tooltips", async () => {
        const user = userEvent.setup()
        const f = renderRound(
            "ve-dich",
            { hetLuot: vi.fn(), rows: [answerRow("u1", "CORRECT")], target: "u1" },
            { open: [openQ] },
            veDichMc({ phase: 1 }),
        )

        expectButtonsInOrder(["Chấm điểm", "Hết lượt", "Về sảnh"])
        const het = screen.getByRole("button", { name: "Hết lượt" })
        await user.click(het)
        expect(f.hetLuot).toHaveBeenCalledOnce()
        expect(het).not.toHaveAttribute("title")
        expect(screen.getByRole("button", { name: "Về sảnh" })).not.toHaveAttribute("title")
    })

    it("Chấm điểm marks the selected player — ve-dich.judge", async () => {
        const user = userEvent.setup()
        const f = renderRound(
            "ve-dich",
            { send: vi.fn(), rows: [answerRow("u1", null)], target: "u1" },
            { open: [openQ] },
            veDichMc({ phase: 1 }),
        )

        await user.click(screen.getByRole("button", { name: "Chấm điểm" }))
        expect(f.sendChain).toHaveBeenCalledWith([
            { kind: "ve-dich.judge", playerId: "u1", correct: true },
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
            { open: [openQ] },
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
            { open: [openQ] },
            veDichMc({ phase: 1 }),
        )

        await user.click(screen.getByRole("button", { name: "Chấm điểm" }))
        expect(f.sendChain).toHaveBeenCalledWith([
            { kind: "ve-dich.judge", playerId: "u1", correct: true },
            { kind: "ve-dich.judge", playerId: "u2", correct: true },
        ])
    })

    it("Hiện trả lời reveals the open question's answer once the clock ran out", async () => {
        const user = userEvent.setup()
        const f = renderRound("ve-dich", {}, { open: [openQ] }, veDichMc({ phase: 1, clockStarted: true }))

        await user.click(screen.getByRole("button", { name: "Hiện trả lời" }))
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
            veDichMc({ phase: 2, clockStarted: true }),
        )

        expectButtonsInOrder(["Mở chuông", "Đúng", "Sai", "Hết lượt", "Về sảnh"])
        await user.click(screen.getByRole("button", { name: "Mở chuông" }))
        expect(f.send).toHaveBeenCalledWith({ kind: "ve-dich.closeCurrentAnswer" })
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

function clickables(): string[] {
    return Array.from(document.querySelectorAll('button, [role="button"]')).map((el) => el.textContent ?? "")
}

function expectButtonsInOrder(expected: string[]) {
    const actual = clickables()
    let cursor = -1
    for (const label of expected) {
        const at = actual.indexOf(label, cursor + 1)
        expect(at, `"${label}" missing after index ${cursor} — got [${actual.join(" · ")}]`).toBeGreaterThan(cursor)
        cursor = at
    }
}


