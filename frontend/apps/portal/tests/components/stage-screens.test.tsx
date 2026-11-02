import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import type { ConsoleFacts } from "@/components/stage/deck"
import type { LiveResponse, VeDichMc } from "@/lib/live"
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
        mc: mc as LiveResponse["mc"],
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

const veDichMc = (over: Partial<VeDichMc> = {}): VeDichMc => ({
    phase: 1,
    turnPlayerId: "u1",
    openStage: "current",
    answererId: "u1",
    buzzerId: null,
    assignedToId: null,
    power: null,
    pendingQuestionId: null,
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

        // overBudget reads the MC's stopwatch: 6s watched into a 5s budget left
        rerender(mod.render(facts(
            { watchMs: 6_000 },
            { oral: { questionId: "q1", question: null, playerId: "u1", index: 2, total: 6, elapsedS: 40, budgetS: 45 } },
        )))
        expect(screen.queryByRole("button", { name: "Sai" })).toBeNull()
    })
})

describe("KhoiDongChung — S2, the buzz race", () => {
    const BUTTON = { selector: "button" } as const
    const raced = (over: Record<string, unknown> = {}) => ({
        stage: "phase2",
        ended: false,
        phase2Begun: true,
        phase2Closed: false,
        questionIndex: 0,
        questionCount: 12,
        attempt: 1,
        windowOpen: false,
        buzzerId: null,
        lockedOut: [],
        ...over,
    })

    it("opens the window, and only when none is running", async () => {
        const user = userEvent.setup()
        const f = renderRound("khoi-dong", { stage: "phase2" }, {}, raced())

        await user.click(screen.getByText("Mở chuông", BUTTON))
        expect(f.send).toHaveBeenCalledWith({ kind: "khoi-dong.openBuzz" })
    })

    it("judges the FASTEST buzzer — Đúng carries the chance's worth", async () => {
        const user = userEvent.setup()
        const f = renderRound("khoi-dong", { stage: "phase2" }, {}, raced({ windowOpen: true, buzzerId: "u1" }))

        await user.click(screen.getByText("Đúng ×10", BUTTON))
        expect(f.send).toHaveBeenCalledWith({ kind: "khoi-dong.judgeBuzz", correct: true })

        await user.click(screen.getByText("Sai", BUTTON))
        expect(f.send).toHaveBeenCalledWith({ kind: "khoi-dong.judgeBuzz", correct: false })
    })

    it("the re-buzz pays 5, and the label says so", () => {
        renderRound("khoi-dong", { stage: "phase2" }, {}, raced({ attempt: 2, windowOpen: true, buzzerId: "u2" }))
        expect(screen.getByText("Đúng ×5", BUTTON)).toBeInTheDocument()
    })

    it("nobody buzzed: Câu tiếp moves on, and there is nothing to judge", () => {
        renderRound("khoi-dong", { stage: "phase2" }, {}, raced({ windowOpen: true }))
        expect(screen.getByText("Câu tiếp", BUTTON)).toBeInTheDocument()
        expect(screen.queryByText("Đúng ×10", BUTTON)).toBeNull()
        expect(screen.queryByText("Sai", BUTTON)).toBeNull()
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

    it("the MC declares STAR for the player whose question it is", async () => {
        const user = userEvent.setup()
        const f = renderRound("ve-dich", {}, opened, veDichMc({ phase: 2, turnPlayerId: "u1" }))

        await user.click(screen.getByText("Ngôi sao", BUTTON))
        expect(f.send).toHaveBeenCalledWith({
            kind: "ve-dich.declarePower",
            playerId: "u1",
            power: "STAR"
        })
    })

    it("ASSIGN needs a target: no selected card, no button", async () => {
        const user = userEvent.setup()
        const f = renderRound("ve-dich", { target: "u2" }, opened, veDichMc({ phase: 2, turnPlayerId: "u1" }))

        await user.click(screen.getByText("Chỉ định", BUTTON))
        expect(f.send).toHaveBeenCalledWith({
            kind: "ve-dich.declarePower",
            playerId: "u1",
            power: "ASSIGN",
            targetId: "u2"
        })
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
})

describe("VeDichPick — S5/S6, the board", () => {
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

// score adjust's ± chip was removed from the controller's rail (MC's call) —
// the dialog/machinery stays dormant; no UI asserts it any more.

