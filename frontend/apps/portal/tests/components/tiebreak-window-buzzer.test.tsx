import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { afterEach, describe, expect, it, vi } from "vitest"
import { TieBreakAOCController } from "@/rounds/tiebreak/TieBreakAOCController"
import type { ScreenCore } from "@/rounds/types"
import type { TieBreakView } from "@/rounds/tiebreak/types"

const VIEW = "GET /portal/tournaments/t1/matches/m1/live/tiebreak"

function view(buzzer?: string | null): TieBreakView {
    return {
        matchId: "m1",
        version: 3,
        stage: "tiebreak",
        questionId: "q1",
        cursor: 0,
        ended: false,
        windowOpen: true,
        deadlineAt: null,
        question: null,
        me: null,
        players: [
            { id: "u1", displayName: "An", points: 0, rank: 1, eliminated: false },
            { id: "u2", displayName: "Bình", points: 0, rank: 2, eliminated: false },
        ],
        window: {
            mode: "BUZZ",
            eligibility: "Pair",
            pairA: "u1",
            pairB: "u2",
            openedAt: "2026-01-01T00:00:00.000Z",
            seconds: 20,
            closesAt: null,
            turnPlayerId: null,
            buzzer,
            buzzerMs: 1200,
            locked: false,
        },
    }
}

function core(): ScreenCore {
    return {
        v: {
            version: 3,
            roundId: "tiebreak",
            state: {},
            questions: [],
            projection: {
                matchId: "m1",
                roundId: "tiebreak",
                version: 3,
                stage: "tiebreak",
                open: [],
                table: [],
                hintAnswers: {},
            },
            roundEnded: false,
            console: null,
        },
        flash: null,
        baseCards: [],
        peerControls: new Map(),
        send: vi.fn(),
        sendChain: vi.fn(),
        backToLobby: vi.fn(),
        openAdjust: vi.fn(),
        openRegrade: vi.fn(),
        toggleSelect: vi.fn(),
        selectedIds: new Set<string>(),
        remaining: null,
    }
}

function draw(payload: TieBreakView) {
    const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const key = `${init?.method ?? "GET"} ${String(input)}`
        if (key !== VIEW && key !== `POST ${VIEW.slice(4)}`) throw new Error(`unexpected request: ${key}`)
        return {
            ok: true,
            status: 200,
            statusText: "",
            json: async () => payload,
        } as unknown as Response
    })
    vi.stubGlobal("fetch", mock)

    const client = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    render(
        <QueryClientProvider client={client}>
            <MemoryRouter initialEntries={["/tournaments/t1/matches/m1/control"]}>
                <Routes>
                    <Route
                        path="/tournaments/:tournamentId/matches/:matchId/control"
                        element={<TieBreakAOCController ctx={core()} />}
                    />
                </Routes>
            </MemoryRouter>
        </QueryClientProvider>
    )
    return mock
}

afterEach(() => {
    vi.unstubAllGlobals()
})

describe("TieBreakAOCController — the window's buzzer is an absent key, not a null", () => {
    it("keeps Đúng/Sai inert while the server left buzzer out of the window", async () => {
        draw(view())

        expect(await screen.findByRole("button", { name: "Câu tiếp" })).toBeTruthy()
        expect(screen.getByText("Đúng")).toBeTruthy()
        expect(screen.queryByRole("button", { name: "Đúng" })).toBeNull()
        expect(screen.queryByRole("button", { name: "Sai" })).toBeNull()
    })

    it("lights Đúng/Sai once a player buzzed, and judging sends the verdict", async () => {
        const fetchMock = draw(view("u2"))

        const judge = await screen.findByRole("button", { name: "Đúng" })
        expect(screen.getByRole("button", { name: "Sai" })).toBeTruthy()
        await userEvent.click(judge)
        await waitFor(() => {
            const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST")
            expect(post).toBeTruthy()
            expect(String(post?.[1]?.body)).toContain('"action":"judge"')
            expect(String(post?.[1]?.body)).toContain('"correct":true')
        })
    })
})
