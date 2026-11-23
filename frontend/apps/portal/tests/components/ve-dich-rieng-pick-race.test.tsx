import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { VeDichRiengPickAOCController } from "@/rounds/ve-dich/VeDichRiengPickAOCController"
import type { ConsoleFacts } from "@/components/stage/deck"

const TABLE = [
    { id: "u1", displayName: "An", points: 0, rank: 1 },
    { id: "u2", displayName: "Bình", points: 0, rank: 2 },
    { id: "u3", displayName: "Cúc", points: 0, rank: 3 },
]

function facts(pending: string[], send: (a: unknown) => void): ConsoleFacts {
    return {
        v: {
            version: 1,
            roundId: "ve-dich",
            state: {},
            questions: [],
            roundEnded: false,
            console: {
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
            },
            projection: {
                matchId: "m1",
                roundId: "ve-dich",
                version: 1,
                stage: "phase2",
                open: [],
                selectedPlayerId: "u1",
                table: TABLE,
                board: ["a", "b", "c", "d"].map((id) => ({
                    questionId: id,
                    value: 40,
                    where: pending.includes(id) ? ("pending" as const) : ("free" as const),
                })),
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
        send,
        sendChain: vi.fn(),
        hetLuot: vi.fn(),
        backToLobby: vi.fn(),
        pickQuestion: vi.fn(),
        byId: () => null,
        verdictOf: () => null,
        flash: null,
        openAdjust: vi.fn(),
        openRegrade: vi.fn(),
    } as unknown as ConsoleFacts
}

describe("VeDichRiengPick — rapid picks across server echoes", () => {
    it("keeps the first pick when the server echoes it back before the second click", async () => {
        const user = userEvent.setup()
        const send = vi.fn()
        const { rerender } = render(<VeDichRiengPickAOCController ctx={facts([], send) as never} />)

        await user.click(screen.getAllByTitle("Chọn câu 40 điểm")[0])
        const first = send.mock.calls.at(-1)![0] as { questionIds: string[] }
        expect(first.questionIds).toHaveLength(1)

        rerender(<VeDichRiengPickAOCController ctx={facts(first.questionIds, send) as never} />)
        expect(screen.getAllByTitle("Bỏ câu 40 điểm")).toHaveLength(2)

        await user.click(screen.getAllByTitle("Chọn câu 40 điểm")[0])
        const second = send.mock.calls.at(-1)![0] as { questionIds: string[] }
        expect(second.questionIds).toHaveLength(2)
        expect(second.questionIds[0]).toBe(first.questionIds[0])
    })
})
