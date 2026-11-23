import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { VeDichRiengPickAOCController } from "@/rounds/ve-dich/VeDichRiengPickAOCController"
import type { VeDichConsole } from "@/lib/live"
import type { ConsoleFacts } from "@/components/stage/deck"

const TABLE = [
    { id: "u1", displayName: "An", points: 0, rank: 1 },
    { id: "u2", displayName: "Bình", points: 0, rank: 2 },
    { id: "u3", displayName: "Cúc", points: 0, rank: 3 },
]

function board(pending: string[]) {
    const cells = ["a", "b", "c", "d"].map((id) => ({
        questionId: id,
        value: 40,
        where: pending.includes(id) ? ("pending" as const) : ("free" as const),
    }))
    return cells
}

function facts(pending: string[], over: Partial<ConsoleFacts> = {}): ConsoleFacts {
    const mc: VeDichConsole = {
        phase: 2,
        turnPlayerId: "u1",
        openStage: null,
        answererId: null,
        buzzerId: null,
        buzzerMs: null,
        assignedToId: null,
        power: null,
        pendingQuestionId: pending[0] ?? null,
        turnPicked: pending.length,
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
                stage: "phase2",
                open: [],
                table: TABLE,
                board: board(pending),
                hintAnswers: {},
            },
        },
        stage: "phase2",
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

describe("VeDichRiengPick — chips sync with the server state", () => {
    it("drops a chip when the server already removed that pick", () => {
        const f = facts(["a"])
        const { rerender } = render(<VeDichRiengPickAOCController ctx={f as never} />)

        expect(screen.getAllByTitle("Bỏ câu 40 điểm")).toHaveLength(2)

        rerender(<VeDichRiengPickAOCController ctx={facts([]) as never} />)

        expect(screen.queryByTitle("Bỏ câu 40 điểm")).toBeNull()
    })

    it("keeps every staged pick on screen while the server confirms them", () => {
        const f = facts(["a", "b"])
        render(<VeDichRiengPickAOCController ctx={f as never} />)

        expect(screen.getAllByTitle("Bỏ câu 40 điểm")).toHaveLength(4)
    })

    it("re-sends the full batch when a pick is removed", async () => {
        const user = userEvent.setup()
        const send = vi.fn()
        const f = facts(["a", "b"], { send })
        render(<VeDichRiengPickAOCController ctx={f as never} />)

        const chips = screen.getAllByTitle("Bỏ câu 40 điểm")
        await user.click(chips[0])

        expect(send).toHaveBeenCalledWith({
            kind: "ve-dich.pickBatch",
            playerId: "u1",
            questionIds: ["b"],
        })
    })
})
