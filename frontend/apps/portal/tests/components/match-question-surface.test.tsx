import { screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { MatchQuestionSurface } from "@/components/match-question-surface"
import type { MatchSummary } from "@/lib/tournament"
import { renderWithProviders } from "../helpers/render"


const TOURNAMENT = "t1"
const ASSEMBLE_URL = `PATCH /portal/tournaments/${TOURNAMENT}/matches/m1/assemble`
const DETAIL_URL = `GET /portal/tournaments/${TOURNAMENT}/matches/m1`
const QUESTIONS_URL = `GET /portal/questions?ids=q9&limit=50&offset=0`
const ELIGIBLE = (bucket: string) =>
    `GET /portal/tournaments/${TOURNAMENT}/eligible-questions?kinds=TEXT&bucket=${bucket}&limit=200&offset=0`

const match: MatchSummary = {
    id: "m1",
    stageId: "s1",
    slot: 1,
    label: "Trận 1",
    status: "UPCOMING",
    scheduledAt: "2026-11-14T10:00:00.000Z",
    players: [{ kind: "user", userId: "u1", seed: 1 }],
    questions: [],
    assemblyRevision: 3,
}

const callKey = (call: [RequestInfo | URL, RequestInit?]) =>
    `${call[1]?.method ?? "GET"} ${String(call[0])}`

const callOf = (fetchMock: ReturnType<typeof renderWithProviders>["fetchMock"], key: string) =>
    fetchMock?.mock.calls.find((call) => callKey(call) === key)

const draw = (
    routes: Record<string, { body: unknown; status?: number }> = {},
    fixture: MatchSummary = match
) =>
    renderWithProviders(<MatchQuestionSurface tournamentId={TOURNAMENT} match={fixture} />, {
        routes: {
            [`GET /portal/tournaments/${TOURNAMENT}`]: { body: { roundRules: null } },
            [DETAIL_URL]: { body: { assemblyRevision: match.assemblyRevision, assemblyEvents: [] } },
            [ELIGIBLE("khoi-dong")]: { body: { items: [], total: 0 } },
            [ELIGIBLE("but-pha")]: { body: { items: [], total: 0 } },
            ...routes,
        },
    })

afterEach(() => {
    vi.unstubAllGlobals()
    window.history.pushState({}, "", "/")
})

describe("the match's Câu hỏi tab", () => {
    it("offers the bank's upload and the compose door — and no manual Save button", async () => {
        draw()

        expect(await screen.findByRole("button", { name: /Nhập Excel/ })).toBeInTheDocument()
        expect(screen.getByRole("button", { name: /Sửa câu hỏi/ })).toBeInTheDocument()
        // autosave: the desk never presses Lưu
        expect(screen.queryByRole("button", { name: /Lưu ·/ })).toBeNull()
    })

    it("autosaves a question dropped in from the bank, keeping the editor open", async () => {
        window.history.pushState({}, "", "/?add=q9")
        const { fetchMock } = draw({
            [QUESTIONS_URL]: {
                body: {
                    items: [
                        {
                            id: "q9",
                            kind: "TEXT",
                            questionText: "Câu bứt phá",
                            tags: ["but-pha"],
                            payload: {},
                        },
                    ],
                    total: 1,
                },
            },
            [ASSEMBLE_URL]: { body: { assemblyRevision: 4 } },
        })

        // ?add= opens compose by itself and says it will save on its own
        expect(await screen.findByRole("button", { name: /Xong/ })).toBeInTheDocument()
        expect(await screen.findByText(/Đã thêm 1 câu — tự lưu sau thao tác/)).toBeInTheDocument()

        // …and750 ms after the hand stops, the PATCH goes up unprompted
        const saved = await waitFor(
            () => {
                const call = callOf(fetchMock, ASSEMBLE_URL)
                expect(call).toBeTruthy()
                return call
            },
            { timeout: 4000 }
        )

        const body = JSON.parse(String(saved![1]?.body))
        expect(body.baseRevision).toBe(3)
        expect(body.questions.map((entry: { sourceId: string }) => entry.sourceId)).toContain("q9")

        expect(await screen.findByText(/Đã lưu — revision 4/)).toBeInTheDocument()
        // still inside compose: autosave writes, it never kicks you out
        expect(screen.getByRole("button", { name: /Xong/ })).toBeInTheDocument()
        expect(screen.queryByRole("button", { name: /Lưu ·/ })).toBeNull()
    })

    it("hides the whole desk once the match is past UPCOMING", async () => {
        draw({}, { ...match, status: "FINISHED" })

        expect(await screen.findByText(/Chỉ sửa được khi trận còn UPCOMING/)).toBeInTheDocument()
        expect(screen.queryByRole("button", { name: /Nhập Excel/ })).toBeNull()
        expect(screen.queryByRole("button", { name: /Sửa câu hỏi/ })).toBeNull()
    })
})
