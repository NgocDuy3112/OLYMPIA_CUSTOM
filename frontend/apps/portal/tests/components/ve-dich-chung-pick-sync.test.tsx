import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { VeDichChungPickAOCController } from "@/rounds/ve-dich/VeDichChungPickAOCController"
import type { VeDichConsole } from "@/lib/live"
import type { ConsoleFacts } from "@/components/stage/deck"

const TABLE = [
    { id: "u1", displayName: "An", points: 0, rank: 1 },
    { id: "u2", displayName: "Bình", points: 0, rank: 2 },
    { id: "u3", displayName: "Cúc", points: 0, rank: 3 },
]

function facts(
    pending: string[],
    over: Partial<ConsoleFacts> = {},
    table: ConsoleFacts["v"]["projection"]["table"] = TABLE,
): ConsoleFacts {
    const mc: VeDichConsole = {
        phase: 1,
        turnPlayerId: "u1",
        openStage: null,
        answererId: null,
        buzzerId: null,
        buzzerMs: null,
        assignedToId: null,
        power: null,
        pendingQuestionId: pending[0] ?? null,
        picksConfirmed: false,
        stagedPower: null,
        turnPowerUsed: false,
    }
    return {
        v: {
            version: 1,
            roundId: "ve-dich",
            state: {},
            questions: [],
            roundEnded: false,
            console: mc,
            projection: {
                matchId: "m1",
                roundId: "ve-dich",
                version: 1,
                stage: "phase1",
                open: [],
                selectedPlayerId: null,
                table,
                // rules.md §7.4: lượt chung only draws 20- and 30-point cells.
                board: ["a", "b", "c"].map((id, index) => ({
                    questionId: id,
                    value: index === 1 ? 30 : 20,
                    where: pending.includes(id) ? ("pending" as const) : ("free" as const),
                })),
                hintAnswers: {},
            },
        },
        stage: "phase1",
        remaining: null,
        keywordRemaining: null,
        oralRemaining: null,
        rows: [],
        baseCards: TABLE.map((t) => ({ id: t.id, name: t.displayName, points: t.points })),
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
        flash: null,
        openAdjust: vi.fn(),
        openRegrade: vi.fn(),
        ...over,
    } as unknown as ConsoleFacts
}

describe("VeDichChungPick — local picks follow the server truth", () => {
    it("drops a pick the server refused — a failed action raises the flash", async () => {
        const user = userEvent.setup()
        const send = vi.fn()
        const { rerender } = render(<VeDichChungPickAOCController ctx={facts(["a"], { send }) as never} />)

        await user.click(screen.getByTitle("Chọn câu 30 điểm"))
        expect(send).toHaveBeenCalledWith({ kind: "ve-dich.pickRound", questionIds: ["a", "b"] })
        // Two picks staged: one chip and one board cell each.
        expect(screen.getAllByTitle(/^Bỏ câu/)).toHaveLength(4)

        // The server refused: same view, but the transport now carries the error.
        rerender(
            <VeDichChungPickAOCController
                ctx={facts(["a"], { send, flash: "Câu này vừa bị chọn ở thiết bị khác" }) as never}
            />,
        )

        expect(screen.getAllByTitle(/^Bỏ câu/)).toHaveLength(2)
    })

    it("keeps the pick while the server has not refused it", async () => {
        const user = userEvent.setup()
        render(<VeDichChungPickAOCController ctx={facts(["a"]) as never} />)

        await user.click(screen.getByTitle("Chọn câu 30 điểm"))

        expect(screen.getAllByTitle(/^Bỏ câu/)).toHaveLength(4)
    })

    it("phase 1 never asks for a pick when the table is empty", () => {
        render(<VeDichChungPickAOCController ctx={facts(["a"], {}, []) as never} />)

        // need = table.length = 0: no local target can be "full", so no confirm.
        expect(screen.queryByRole("button", { name: "Xác nhận" })).toBeNull()
    })

    it("the phase-1 rail is a roster, not a picker — no dead click", () => {
        render(<VeDichChungPickAOCController ctx={facts([]) as never} />)

        expect(screen.getByText("An")).toBeInTheDocument()
        // Phase 1 picks a shared batch, so no server action backs a card click.
        expect(screen.queryByRole("button", { name: "An" })).toBeNull()
    })
})
