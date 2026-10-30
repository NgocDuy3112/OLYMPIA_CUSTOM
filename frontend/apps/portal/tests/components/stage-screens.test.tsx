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
): ConsoleFacts {
    const v: LiveResponse = {
        version: 1,
        roundId: "khoi-dong",
        state: {},
        questions: [],
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
        roundEnded: false,
        started: true,
        remaining: 30,
        rows: [],
        baseCards: [],
        bpDone: 0,
        judgingId: null,
        target: null,
        setSelectedQ: vi.fn(),
        setSelectedPlayer: vi.fn(),
        setVerdict: vi.fn(),
        send: vi.fn(),
        hetLuot: vi.fn(),
        ketThuc: vi.fn(),
        byId: () => null,
        verdictOf: () => null,
        watchRunning: false,
        watchMs: 0,
        toggleWatch: vi.fn(),
        flash: null,
        openRounds: vi.fn(),
        ...over,
    }
}

/** Render a round through its registry module — the path production takes. */
function renderRound(
    roundId: string,
    over: Partial<ConsoleFacts> = {},
    projection: Partial<LiveResponse["projection"]> = {},
    mc: unknown = null,
): ConsoleFacts {
    const f = facts(over, projection, mc)
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
        expect(f.ketThuc).toHaveBeenCalledOnce()
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

describe("KhoiDongChung — S2, the shared typed round", () => {
    it("judges only when a player is selected", async () => {
        const user = userEvent.setup()
        const f = renderRound("khoi-dong", { stage: "phase2", setVerdict: vi.fn(), target: "u1" })

        expectButtonsInOrder(["Đúng", "Sai", "Về sảnh"])
        await user.click(screen.getByRole("button", { name: "Sai" }))
        expect(f.setVerdict).toHaveBeenCalledWith(false)
    })

    it("offers no verdict buttons without a target", () => {
        renderRound("khoi-dong", { stage: "phase2", target: null })
        expect(screen.queryByRole("button", { name: "Đúng" })).toBeNull()
        expect(screen.queryByRole("button", { name: "Sai" })).toBeNull()
    })
})

describe("GiaiMa — S3", () => {
    it("Đúng resolves the hint window; Sai stays inert (auto-scored)", async () => {
        const user = userEvent.setup()
        const f = renderRound("giai-ma", { send: vi.fn() })

        expectButtonsInOrder(["Đúng", "Về sảnh"])
        await user.click(screen.getByRole("button", { name: "Đúng" }))
        expect(f.send).toHaveBeenCalledWith({ kind: "giai-ma.resolveHint" })
        expect(screen.getByText("Sai")).toBeInTheDocument()
        expect(screen.queryByRole("button", { name: "Sai" })).toBeNull()
    })
})

describe("ButPha — S4", () => {
    it("Tính giờ opens the sprint, Về sảnh ends the round", async () => {
        const user = userEvent.setup()
        const f = renderRound("but-pha", { send: vi.fn() })

        expectButtonsInOrder(["Tính giờ", "Về sảnh"])
        await user.click(screen.getByRole("button", { name: "Tính giờ" }))
        expect(f.send).toHaveBeenCalledWith({ kind: "but-pha.openQuestion" })
        await user.click(screen.getByRole("button", { name: "Về sảnh" }))
        expect(f.ketThuc).toHaveBeenCalledOnce()
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

    it("Về sảnh always sends ketThuc while the round runs", async () => {
        const user = userEvent.setup()
        const f = renderRound("ve-dich", { verdictOf: () => "CORRECT" }, { open: [openQ] }, veDichMc({ phase: 2 }))
        await user.click(screen.getByRole("button", { name: "Về sảnh" }))
        expect(f.ketThuc).toHaveBeenCalledOnce()
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
