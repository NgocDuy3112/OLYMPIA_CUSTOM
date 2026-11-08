import { renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { ReactNode } from "react"
import { describe, expect, it } from "vitest"
import { useConsoleModel } from "@/console/use-console-model"
import type { LobbyData, LiveResponse } from "@/lib/live"
import { stubFetch } from "../helpers/render"


const T = "t1"
const M = "m1"
const LIVE = `GET /portal/tournaments/${T}/matches/${M}/live`
const LOBBY = `GET /portal/tournaments/${T}/matches/${M}/lobby`
const MATCHES = `GET /portal/tournaments/${T}/matches`
const RTC = `POST /portal/tournaments/${T}/matches/${M}/rtc/token`
const ACTIONS = `POST /portal/tournaments/${T}/matches/${M}/live/actions`

function liveView(over: Partial<LiveResponse> = {}): LiveResponse {
    return {
        version: 7,
        roundId: "khoi-dong",
        state: {},
        questions: [],
        projection: {
            matchId: M,
            roundId: "khoi-dong",
            version: 7,
            stage: "phase2",
            open: [{ questionId: "q1", deadlineAt: null, question: null }],
            table: [{ id: "u1", displayName: "An", points: 10, rank: 1 }],
        } as LiveResponse["projection"],
        roundEnded: false,
        connected: [],
        console: {
            stage: "phase2",
            ended: false,
            phase2Begun: true,
            phase2Closed: false,
            questionIndex: 2,
            questionCount: 12,
            attempt: 1,
            windowOpen: true,
            buzzerId: null,
            lockedOut: [],
        },
        ...over,
    }
}

function lobbyData(over: Partial<LobbyData> = {}): LobbyData {
    return {
        title: "Tournament",
        label: "Match",
        status: "LIVE",
        roundId: "khoi-dong",
        rounds: [{ id: "khoi-dong", name: "Khởi động", status: "playing" }],
        table: [{ id: "u1", displayName: "An", points: 10, rank: 1 }],
        connected: [],
        ...over,
    }
}

function renderModel(routes: Record<string, { body: unknown; status?: number }> = {}) {
    const fetchMock = stubFetch({
        [LIVE]: { body: liveView() },
        [LOBBY]: { body: lobbyData() },
        [MATCHES]: { body: { items: [], total: 0, limit: 20, offset: 0 } },
        [RTC]: { body: { message: "not live" }, status: 409 },
        [ACTIONS]: { body: { version: 8 } },
        ...routes,
    })

    const client = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )

    const rendered = renderHook(() => useConsoleModel(T, M), { wrapper })
    return { ...rendered, fetchMock }
}

type Model = ReturnType<typeof useConsoleModel>
const phaseOf = (model: Model) => model.phase

function deckOf(model: Model) {
    if (model.phase !== "deck") throw new Error(`not the deck: ${model.phase}`)
    return model.facts
}
function lobbyOf(model: Model) {
    if (model.phase !== "lobby") throw new Error(`not the lobby: ${model.phase}`)
    return model
}

describe("useConsoleModel — the deck and the waiting room", () => {
    it("draws the round's deck while the round is running", async () => {
        const { result } = renderModel()
        await waitFor(() => expect(phaseOf(result.current)).toBe("deck"))
    })

    it("Về sảnh lands on the waiting room — even though the round is still live", async () => {
        const { result, fetchMock } = renderModel()
        await waitFor(() => expect(phaseOf(result.current)).toBe("deck"))

        deckOf(result.current).backToLobby()
        await waitFor(() => expect(phaseOf(result.current)).toBe("lobby"))

        const posts = fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")
        expect(posts.some(([url]) => String(url) === `/portal/tournaments/${T}/matches/${M}/live/actions`))
            .toBe(true)
    })

    it("carries the race's facts to the controller (attempt, window, buzzer)", async () => {
        const { result } = renderModel()
        await waitFor(() => expect(phaseOf(result.current)).toBe("deck"))

        const mc = deckOf(result.current).v.console as Record<string, unknown> | null
        expect(mc).toMatchObject({
            questionIndex: 2,
            questionCount: 12,
            attempt: 1,
            windowOpen: true,
            buzzerId: null,
        })
    })

    it("starts a round from the waiting room and returns to the deck", async () => {
        const { result } = renderModel()
        await waitFor(() => expect(phaseOf(result.current)).toBe("deck"))

        deckOf(result.current).backToLobby()
        await waitFor(() => expect(phaseOf(result.current)).toBe("lobby"))

        lobbyOf(result.current).onStart("khoi-dong", 2)
        await waitFor(() => expect(phaseOf(result.current)).toBe("deck"))
    })
})
