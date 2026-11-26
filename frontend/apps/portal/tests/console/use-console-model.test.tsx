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
const CONTROL_PATH = `/portal/tournaments/${T}/matches/${M}/live/control`
const CONTROL = `POST ${CONTROL_PATH}`
const ME = "GET /portal/auth/me"

const ME_BODY = {
    id: "me1",
    username: "operator",
    displayName: "Operator",
    role: "OPERATOR",
    emailVerified: true,
    totpEnabled: false,
    avatarUrl: null,
}

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
            hintAnswers: {},
        } as LiveResponse["projection"],
        roundEnded: false,
        connected: [],
        controller: null,
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
        [ME]: { body: ME_BODY },
        [CONTROL]: { body: { id: "me1", name: "Operator", active: true } },
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

    it("Về đích · Riêng starts phase 2 even though the round is already live", async () => {
        const { result, fetchMock } = renderModel({
            [LIVE]: {
                body: liveView({
                    roundId: "ve-dich",
                    projection: {
                        matchId: M,
                        roundId: "ve-dich",
                        version: 7,
                        stage: "phase1",
                        open: [],
                        table: [{ id: "u1", displayName: "An", points: 10, rank: 1 }],
                        hintAnswers: {},
                    } as LiveResponse["projection"],
                    console: {
                        phase: 1,
                        turnPlayerId: "u1",
                        openStage: null,
                        answererId: null,
                        buzzerId: null,
                        powersLeft: [],
                        stagedPower: null,
                        turnPowerUsed: false,
                    },
                }),
            },
            [LOBBY]: {
                body: lobbyData({
                    roundId: "ve-dich",
                    rounds: [
                        { id: "ve-dich", name: "Về đích · Chung", status: "playing" },
                        { id: "ve-dich", name: "Về đích · Riêng", status: "playing" },
                    ],
                }),
            },
        })

        await waitFor(() => expect(phaseOf(result.current)).toBe("deck"))

        deckOf(result.current).backToLobby()
        await waitFor(() => expect(phaseOf(result.current)).toBe("lobby"))

        lobbyOf(result.current).onStart("ve-dich", 2)
        await waitFor(() => expect(phaseOf(result.current)).toBe("deck"))

        const actions = fetchMock.mock.calls
            .filter(([, init]) => init?.method === "POST")
            .filter(([url]) => String(url) === `/portal/tournaments/${T}/matches/${M}/live/actions`)
            .map(([, init]) => (JSON.parse(String(init?.body)) as { action: { kind: string; phase?: number } }).action)
        expect(actions).toContainEqual(expect.objectContaining({ kind: "ve-dich.start", phase: 2 }))
        expect(actions.some((a) => a.kind === "ve-dich.beginPhase2")).toBe(false)
    })

    it("Khởi động · Chung starts phase 2 even though phase 1 is live", async () => {
        const { result, fetchMock } = renderModel({
            [LIVE]: {
                body: liveView({
                    projection: {
                        matchId: M,
                        roundId: "khoi-dong",
                        version: 7,
                        stage: "phase1",
                        open: [],
                        table: [{ id: "u1", displayName: "An", points: 10, rank: 1 }],
                        hintAnswers: {},
                    } as LiveResponse["projection"],
                    console: {
                        stage: "phase1",
                        ended: false,
                        phase2Begun: false,
                        phase2Closed: false,
                        questionIndex: 0,
                        questionCount: 6,
                        windowOpen: false,
                    },
                }),
            },
        })

        await waitFor(() => expect(phaseOf(result.current)).toBe("deck"))

        deckOf(result.current).backToLobby()
        await waitFor(() => expect(phaseOf(result.current)).toBe("lobby"))

        lobbyOf(result.current).onStart("khoi-dong", 2)
        await waitFor(() => expect(phaseOf(result.current)).toBe("deck"))

        const actions = fetchMock.mock.calls
            .filter(([, init]) => init?.method === "POST")
            .filter(([url]) => String(url) === `/portal/tournaments/${T}/matches/${M}/live/actions`)
            .map(([, init]) => (JSON.parse(String(init?.body)) as { action: { kind: string; phase?: number } }).action)
        expect(actions).toContainEqual(expect.objectContaining({ kind: "khoi-dong.start", phase: 2 }))
    })
})

describe("useConsoleModel — single controller", () => {
    it("claims control on mount and holds it while no one else does", async () => {
        const { result, fetchMock } = renderModel()
        await waitFor(() => expect(phaseOf(result.current)).toBe("deck"))

        expect(result.current.control.blocked).toBe(false)
        expect(result.current.control.holding).toBe(true)
        expect(result.current.control.controllerName).toBeNull()

        await waitFor(() => {
            const pings = fetchMock.mock.calls.filter(
                ([url, init]) => init?.method === "POST" && String(url) === CONTROL_PATH
            )
            expect(pings.length).toBeGreaterThan(0)
        })
    })

    it("blocks with the holder's name when another operator holds an active lease", async () => {
        const { result } = renderModel({
            [LIVE]: { body: liveView({ controller: { id: "other1", name: "Minh", active: true } }) },
        })
        await waitFor(() => expect(phaseOf(result.current)).toBe("deck"))

        expect(result.current.control.blocked).toBe(true)
        expect(result.current.control.holding).toBe(false)
        expect(result.current.control.controllerName).toBe("Minh")
    })

    it("stays in control when the lease is mine", async () => {
        const { result } = renderModel({
            [LIVE]: { body: liveView({ controller: { id: "me1", name: "Operator", active: true } }) },
        })
        await waitFor(() => expect(phaseOf(result.current)).toBe("deck"))

        expect(result.current.control.blocked).toBe(false)
        expect(result.current.control.holding).toBe(true)
    })

    it("treats a stale lease as free so the console can steal it back", async () => {
        const { result } = renderModel({
            [LIVE]: { body: liveView({ controller: { id: "other1", name: "Minh", active: false } }) },
        })
        await waitFor(() => expect(phaseOf(result.current)).toBe("deck"))

        expect(result.current.control.blocked).toBe(false)
        expect(result.current.control.holding).toBe(true)
    })

    it("takeover posts takeover: true to the control endpoint", async () => {
        const { result, fetchMock } = renderModel({
            [LIVE]: { body: liveView({ controller: { id: "other1", name: "Minh", active: true } }) },
        })
        await waitFor(() => expect(phaseOf(result.current)).toBe("deck"))

        result.current.control.takeover()

        await waitFor(() => {
            const call = fetchMock.mock.calls.find(
                ([url, init]) =>
                    init?.method === "POST" &&
                    String(url) === CONTROL_PATH &&
                    String(init?.body) === JSON.stringify({ takeover: true })
            )
            expect(call).toBeTruthy()
        })
    })

    it("refuses to start a round from the waiting room while blocked", async () => {
        const { result, fetchMock } = renderModel({
            [LIVE]: { body: liveView({ controller: { id: "other1", name: "Minh", active: true } }) },
        })
        await waitFor(() => expect(phaseOf(result.current)).toBe("deck"))

        deckOf(result.current).backToLobby()
        await waitFor(() => expect(phaseOf(result.current)).toBe("lobby"))

        const countActions = () =>
            fetchMock.mock.calls.filter(
                ([url, init]) => init?.method === "POST" && String(url) === ACTIONS
            ).length
        const before = countActions()

        lobbyOf(result.current).onStart("khoi-dong", 2)
        await new Promise((resolve) => setTimeout(resolve, 50))

        expect(countActions()).toBe(before)
        expect(phaseOf(result.current)).toBe("lobby")
    })
})

describe("useConsoleModel — ending the match", () => {
    it("Kết thúc trận đấu from the waiting room PATCHes status FINISHED", async () => {
        const { result, fetchMock } = renderModel()
        await waitFor(() => expect(phaseOf(result.current)).toBe("deck"))

        deckOf(result.current).backToLobby()
        await waitFor(() => expect(phaseOf(result.current)).toBe("lobby"))

        lobbyOf(result.current).endMatch()
        await waitFor(() => {
            const call = fetchMock.mock.calls.find(
                ([url, init]) =>
                    init?.method === "PATCH" &&
                    String(url) === `/portal/tournaments/${T}/matches/${M}/status`
            )
            expect(call).toBeTruthy()
            expect(String(call?.[1]?.body)).toBe(JSON.stringify({ status: "FINISHED" }))
        })
    })
})
