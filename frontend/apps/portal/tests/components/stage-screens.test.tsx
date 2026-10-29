import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import type { DeckCtx } from "@/components/stage/deck"
import type { LiveResponse, VeDichMc } from "@/lib/live"
import { KhoiDongRiengScreen } from "@/components/stage/screens/KhoiDongRiengScreen"
import { KhoiDongChungScreen } from "@/components/stage/screens/KhoiDongChungScreen"
import { GiaiMaScreen } from "@/components/stage/screens/GiaiMaScreen"
import { ButPhaScreen } from "@/components/stage/screens/ButPhaScreen"
import { VeDichPickScreen } from "@/components/stage/screens/VeDichPickScreen"
import { VeDichChungScreen } from "@/components/stage/screens/VeDichChungScreen"
import { VeDichRiengScreen } from "@/components/stage/screens/VeDichRiengScreen"

/**
 * Every MC screen is pure (DeckCtx in, JSX out), so the fixture IS the state.
 * Clickable boxes are real buttons (role="button"), which is what these tests
 * query — strip order, gating, and the actions each button sends.
 */
function deckCtx(
    over: Partial<DeckCtx> = {},
    projection: Partial<LiveResponse["projection"]> = {},
): DeckCtx {
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
        mc: null,
    }
    return {
        v,
        roundEnded: false,
        started: true,
        remaining: 30,
        questions: [],
        rows: [],
        baseCards: [],
        mcGiaiMa: null,
        mcVeDich: null,
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

/** The clickable labels in DOM order — strip items keep their index order. */
function clickables(): string[] {
    return Array.from(document.querySelectorAll('[role="button"]')).map((el) => el.textContent ?? "")
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

describe("KhoiDongRiengScreen — S1, the oral run", () => {
    it("shows the stopwatch strip and sends the run's verdict", async () => {
        const user = userEvent.setup()
        const send = vi.fn()
        const ctx = deckCtx({ send }, {
            oral: { questionId: "q1", question: null, playerId: "u1", index: 0, total: 6, elapsedS: 10, budgetS: 45 },
        })
        render(<KhoiDongRiengScreen ctx={ctx} />)

        expectButtonsInOrder(["Tính giờ", "Đúng", "Sai", "Về sảnh"])
        await user.click(screen.getByRole("button", { name: "Đúng" }))
        expect(send).toHaveBeenCalledWith({ kind: "khoi-dong.recordOral", correct: true, spentS: 0 })
        await user.click(screen.getByRole("button", { name: "Về sảnh" }))
        expect(ctx.ketThuc).toHaveBeenCalledOnce()
    })

    it("locks Đúng/Sai while no run is open, and once the budget is blown", () => {
        const { rerender } = render(<KhoiDongRiengScreen ctx={deckCtx()} />)
        expect(screen.queryByRole("button", { name: "Đúng" })).toBeNull()
        expect(screen.getByRole("button", { name: "Về sảnh" })).toBeInTheDocument()

        // overBudget reads the MC's stopwatch: 6s watched into a 5s budget left
        rerender(
            <KhoiDongRiengScreen
                ctx={deckCtx({ watchMs: 6_000 }, {
                    oral: { questionId: "q1", question: null, playerId: "u1", index: 2, total: 6, elapsedS: 40, budgetS: 45 },
                })}
            />,
        )
        expect(screen.queryByRole("button", { name: "Sai" })).toBeNull()
    })
})

describe("KhoiDongChungScreen — S2, the shared typed round", () => {
    it("judges only when a player is selected", async () => {
        const user = userEvent.setup()
        const setVerdict = vi.fn()
        render(<KhoiDongChungScreen ctx={deckCtx({ setVerdict, target: "u1" })} />)

        expectButtonsInOrder(["Đúng", "Sai", "Về sảnh"])
        await user.click(screen.getByRole("button", { name: "Sai" }))
        expect(setVerdict).toHaveBeenCalledWith(false)
    })

    it("offers no verdict buttons without a target", () => {
        render(<KhoiDongChungScreen ctx={deckCtx({ target: null })} />)
        expect(screen.queryByRole("button", { name: "Đúng" })).toBeNull()
        expect(screen.queryByRole("button", { name: "Sai" })).toBeNull()
    })
})

describe("GiaiMaScreen — S3", () => {
    it("Đúng resolves the hint window; Sai stays inert (auto-scored)", async () => {
        const user = userEvent.setup()
        const send = vi.fn()
        render(<GiaiMaScreen ctx={deckCtx({ send })} />)

        expectButtonsInOrder(["Đúng", "Về sảnh"])
        await user.click(screen.getByRole("button", { name: "Đúng" }))
        expect(send).toHaveBeenCalledWith({ kind: "giai-ma.resolveHint" })
        expect(screen.getByText("Sai")).toBeInTheDocument()
        expect(screen.queryByRole("button", { name: "Sai" })).toBeNull()
    })
})

describe("ButPhaScreen — S4", () => {
    it("Tính giờ opens the sprint, Về sảnh ends the round", async () => {
        const user = userEvent.setup()
        const send = vi.fn()
        const ctx = deckCtx({ send })
        render(<ButPhaScreen ctx={ctx} />)

        expectButtonsInOrder(["Tính giờ", "Về sảnh"])
        await user.click(screen.getByRole("button", { name: "Tính giờ" }))
        expect(send).toHaveBeenCalledWith({ kind: "but-pha.openQuestion" })
        await user.click(screen.getByRole("button", { name: "Về sảnh" }))
        expect(ctx.ketThuc).toHaveBeenCalledOnce()
    })
})

describe("VeDichPickScreen — S5/S6, the board", () => {
    it("phase 1: Bắt đầu jumps to phase 2, Chọn lại skips the pick", async () => {
        const user = userEvent.setup()
        const send = vi.fn()
        render(
            <VeDichPickScreen
                ctx={deckCtx({ send, mcVeDich: veDichMc({ phase: 1 }) })}
            />,
        )

        expectButtonsInOrder(["Bắt đầu", "Chọn lại", "Về sảnh"])
        await user.click(screen.getByRole("button", { name: "Bắt đầu" }))
        expect(send).toHaveBeenCalledWith({ kind: "ve-dich.beginPhase2" })
        await user.click(screen.getByRole("button", { name: "Chọn lại" }))
        expect(send).toHaveBeenCalledWith({ kind: "ve-dich.advanceTurn" })
    })

    it("phase 2: Bắt đầu opens the question the student picked", async () => {
        const user = userEvent.setup()
        const send = vi.fn()
        render(
            <VeDichPickScreen
                ctx={deckCtx({ send, mcVeDich: veDichMc({ phase: 2, pendingQuestionId: "q9" }) })}
            />,
        )

        await user.click(screen.getByRole("button", { name: "Bắt đầu" }))
        expect(send).toHaveBeenCalledWith({ kind: "ve-dich.openQuestion", questionId: "q9" })
    })
})

describe("VeDichChungScreen — S7, phase 1 question", () => {
    it("keeps Hết lượt locked while the answerer has no verdict", () => {
        render(
            <VeDichChungScreen
                ctx={deckCtx({ target: "u1", mcVeDich: veDichMc({ phase: 1 }) }, { open: [openQ] })}
            />,
        )
        expect(screen.queryByRole("button", { name: "Hết lượt" })).toBeNull()
    })

    it("unlocks Hết lượt with the verdict — and strip buttons carry no tooltips", async () => {
        const user = userEvent.setup()
        const hetLuot = vi.fn()
        render(
            <VeDichChungScreen
                ctx={deckCtx(
                    { hetLuot, target: "u1", mcVeDich: veDichMc({ phase: 1 }), verdictOf: () => "CORRECT" },
                    { open: [openQ] },
                )}
            />,
        )

        expectButtonsInOrder(["Đúng", "Sai", "Hết lượt", "Về sảnh"])
        const het = screen.getByRole("button", { name: "Hết lượt" })
        await user.click(het)
        expect(hetLuot).toHaveBeenCalledOnce()
        // tooltips are gone (user decision): the buttons carry no title
        expect(het).not.toHaveAttribute("title")
        expect(screen.getByRole("button", { name: "Về sảnh" })).not.toHaveAttribute("title")
    })
})

describe("VeDichRiengScreen — S8, phase 2 question", () => {
    it("offers the full turn strip: chuông, verdicts, hết lượt, về sảnh", async () => {
        const user = userEvent.setup()
        const send = vi.fn()
        const hetLuot = vi.fn()
        render(
            <VeDichRiengScreen
                ctx={deckCtx(
                    { send, hetLuot, target: "u1", mcVeDich: veDichMc({ phase: 2 }), verdictOf: () => "CORRECT" },
                    { open: [openQ] },
                )}
            />,
        )

        expectButtonsInOrder(["Mở chuông", "Đúng", "Sai", "Hết lượt", "Về sảnh"])
        await user.click(screen.getByRole("button", { name: "Mở chuông" }))
        expect(send).toHaveBeenCalledWith({ kind: "ve-dich.closeCurrentAnswer" })
        await user.click(screen.getByRole("button", { name: "Hết lượt" }))
        expect(hetLuot).toHaveBeenCalledOnce()
    })

    it("locks Hết lượt while a recorded buzzer has no verdict", () => {
        render(
            <VeDichRiengScreen
                ctx={deckCtx(
                    {
                        mcVeDich: veDichMc({ phase: 2, openStage: "buzz", buzzerId: "u2" }),
                        verdictOf: (_qid, uid) => (uid === "u1" ? "CORRECT" : null),
                    },
                    { open: [openQ] },
                )}
            />,
        )
        expect(screen.queryByRole("button", { name: "Hết lượt" })).toBeNull()
    })

    it("Về sảnh always sends ketThuc while the round runs", async () => {
        const user = userEvent.setup()
        const ctx = deckCtx({ mcVeDich: veDichMc({ phase: 2 }), verdictOf: () => "CORRECT" }, { open: [openQ] })
        render(<VeDichRiengScreen ctx={ctx} />)
        await user.click(screen.getByRole("button", { name: "Về sảnh" }))
        expect(ctx.ketThuc).toHaveBeenCalledOnce()
    })
})
