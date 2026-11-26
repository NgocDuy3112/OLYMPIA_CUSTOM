import { act, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { AudienceScreen } from "@/components/AudienceScreen"
import { audienceCtx, type AudienceRemaining } from "@/lib/audience"
import type { PlayerView } from "@shared/deck/types"

function view(over: Partial<PlayerView> = {}): PlayerView {
    return {
        matchId: "m1",
        roundId: "ve-dich",
        version: 1,
        stage: "phase2",
        open: [],
        table: [],
        me: { pickedTiles: [], hintVerdicts: {} },
        hintAnswers: {},
        keywordDeadlineAt: null,
        keywordLength: 0,
        keywordKind: "letters",
        ...over,
    }
}

const question = {
    questionId: "q1",
    kind: "TEXT" as const,
    position: 1,
    questionText: "Câu hỏi",
    media: null,
    payload: {},
}

const remaining = (over: Partial<AudienceRemaining> = {}): AudienceRemaining => ({
    remaining: 0,
    oralRemaining: 0,
    ...over,
})

afterEach(() => {
    vi.useRealTimers()
})

describe("audienceCtx — the LED takes its countdown from the caller", () => {
    it("carries the remaining time instead of a frozen zero", () => {
        const ctx = audienceCtx(view(), remaining({ remaining: 4_500, oralRemaining: 12_000 }))
        expect(ctx.audience).toBe(true)
        expect(ctx.remaining).toBe(4_500)
        expect(ctx.oralRemaining).toBe(12_000)
        expect(ctx.clock.skew()).toBe(0)
    })

    it("is a spectator: no player identity and no commands", () => {
        const ctx = audienceCtx(view(), remaining())
        expect(ctx.myId).toBeNull()
        expect(() => ctx.command({ type: "buzz", questionId: "q1" })).not.toThrow()
    })
})

describe("the LED clock counts down", () => {
    it("ve-dich-rieng shows the open question's remaining time, not 00", () => {
        vi.useFakeTimers()
        const deadlineAt = new Date(Date.now() + 90_000).toISOString()
        render(
            <AudienceScreen
                view={view({ open: [{ questionId: "q1", deadlineAt, question }] })}
            />
        )
        expect(screen.getByText("90")).toBeInTheDocument()

        act(() => {
            vi.advanceTimersByTime(2_000)
        })
        expect(screen.getByText("88")).toBeInTheDocument()
    })

    it("the 5s buzz window counts down too instead of sticking at 00", () => {
        vi.useFakeTimers()
        const deadlineAt = new Date(Date.now() + 5_000).toISOString()
        render(
            <AudienceScreen
                view={view({ open: [{ questionId: "q1", deadlineAt, question }] })}
            />
        )
        expect(screen.getByText("05")).toBeInTheDocument()

        act(() => {
            vi.advanceTimersByTime(1_000)
        })
        expect(screen.getByText("04")).toBeInTheDocument()
    })

    it("khoi-dong-rieng counts the oral turn down", () => {
        vi.useFakeTimers()
        const deadlineAt = new Date(Date.now() + 30_000).toISOString()
        render(
            <AudienceScreen
                view={view({
                    roundId: "khoi-dong",
                    stage: "phase1",
                    oral: {
                        questionId: "q1",
                        question,
                        playerId: "u1",
                        index: 0,
                        total: 6,
                        elapsedS: 0,
                        budgetS: 30,
                        deadlineAt,
                    },
                })}
            />
        )
        expect(screen.getByText("30")).toBeInTheDocument()

        act(() => {
            vi.advanceTimersByTime(1_000)
        })
        expect(screen.getByText("29")).toBeInTheDocument()
    })

    it("a passed deadline reads 00 — the countdown is not stuck there by default", () => {
        vi.useFakeTimers()
        const deadlineAt = new Date(Date.now() - 1_000).toISOString()
        render(
            <AudienceScreen
                view={view({ open: [{ questionId: "q1", deadlineAt, question }] })}
            />
        )
        expect(screen.getByText("00")).toBeInTheDocument()
    })
})

describe("the LED tells the three pick-board states apart", () => {
    const pickView = (board: NonNullable<PlayerView["board"]>) =>
        view({ roundId: "ve-dich", stage: "phase1", open: [], board })

    it("paints a staged cell with its own dashed tone, apart from free and used cells", () => {
        render(
            <AudienceScreen
                view={pickView([
                    { questionId: "q20a", value: 20, where: "pending" },
                    { questionId: "q20b", value: 20, where: "free" },
                    { questionId: "q20c", value: 20, where: "taken" },
                    { questionId: "q30a", value: 30, where: "free" },
                    { questionId: "q30b", value: 30, where: "free" },
                    { questionId: "q30c", value: 30, where: "free" },
                ])}
            />
        )

        const staged = screen.getByTitle("Câu 20 điểm đã chọn — chờ xác nhận")
        expect(staged.className).toContain("border-dashed")
        expect(staged.className).toContain("border-primary")

        const free = screen.getAllByTitle("Câu 20 điểm còn trống")[0]
        expect(free.className).not.toContain("border-dashed")

        const used = screen.getByTitle("Câu 20 điểm đã dùng")
        expect(used.className).not.toContain("border-dashed")
        expect(used.className).toContain("opacity-50")
    })

    it("chips name the staged question even though the LED has no me.pendingPicks", () => {
        render(
            <AudienceScreen
                view={pickView([
                    { questionId: "q20a", value: 20, where: "pending" },
                    { questionId: "q30a", value: 30, where: "free" },
                    { questionId: "q30b", value: 30, where: "free" },
                    { questionId: "q30c", value: 30, where: "free" },
                    { questionId: "q30d", value: 30, where: "free" },
                    { questionId: "q30e", value: 30, where: "free" },
                ])}
            />
        )

        const chips = screen.getAllByTitle("Đã chọn câu 20 điểm")
        expect(chips).toHaveLength(1)
        // A staged pick is not on stage yet — only the open question breathes.
        expect(chips[0].className).not.toContain("stage-pulse")
    })
})
