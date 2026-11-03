// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { Controller } from "@/console/controller"
import type { LobbyData, LiveResponse } from "@/lib/live"
import { stubFetch } from "../helpers/render"

// The console's PHASE MACHINE, rendered for real.
//
// use-console-model.test.tsx reads the hook; this file mounts the actual host, so
// what it asserts is what the operator SEES: which screen a phase draws, and —
// the one that matters most — that Về sảnh lands on the waiting room WITHOUT the
// engine confirming it. That flag (atWaiting) is the only thing standing between
// an ended round and a deck that keeps drawing it.

const T = "t1"
const M = "m1"
const LIVE = `GET /portal/tournaments/${T}/matches/${M}/live`
const LOBBY = `GET /portal/tournaments/${T}/matches/${M}/lobby`
const MATCHES = `GET /portal/tournaments/${T}/matches?limit=100`
const RTC = `POST /portal/tournaments/${T}/matches/${M}/rtc/token`
const ACTIONS = `POST /portal/tournaments/${T}/matches/${M}/live/actions`
const STATUS = `PATCH /portal/tournaments/${T}/matches/${M}/status`
const LIVE_PATH = `/portal/tournaments/${T}/matches/${M}/live`

/** A live read mid-round: khoi-dong phase 2 (the buzz race), one open question. */
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

function lobbyData(): LobbyData {
    return {
        title: "Tournament",
        label: "Match",
        status: "LIVE",
        roundId: null,
        rounds: [{ id: "khoi-dong", name: "Khởi động", status: "idle" }],
        table: [{ id: "u1", displayName: "An", points: 10, rank: 1 }],
        connected: [],
    } as unknown as LobbyData
}

function draw(routes: Record<string, { body: unknown; status?: number }> = {}) {
    const fetchMock = stubFetch({
        [LIVE]: { body: liveView() },
        [LOBBY]: { body: lobbyData() },
        [MATCHES]: { body: { items: [], total: 0, limit: 20, offset: 0 } },
        // RTC is a side-channel: refuse the token so the deck never dials.
        [RTC]: { body: { message: "not live" }, status: 409 },
        [ACTIONS]: { body: { version: 8 } },
        ...routes,
    })
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const view = render(
        <QueryClientProvider client={client}>
            <Controller tournamentId={T} matchId={M} />
        </QueryClientProvider>
    )
    return { fetchMock, client, ...view }
}

describe("the console's phase machine — which screen a phase draws", () => {
    it("says it is reading while the first live read is in flight", () => {
        // a read that never answers: the deck must hold the frame, not flicker
        vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})))
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
        render(
            <QueryClientProvider client={client}>
                <Controller tournamentId={T} matchId={M} />
            </QueryClientProvider>
        )
        expect(screen.getByText("Đang tải vòng thi…")).toBeTruthy()
    })

    it("draws the round deck once a live view is in hand", async () => {
        draw()
        // the round module's controller screen: the strip's Về sảnh control
        expect(await screen.findByRole("button", { name: "Về sảnh" })).toBeTruthy()
    })

    it("says the match is not live when the read fails and the lobby answers", async () => {
        draw({ [LIVE]: { body: { message: "Trận chưa mở" }, status: 500 } })
        expect(await screen.findByText(/Trận chưa LIVE/)).toBeTruthy()
    })

    it("shows the error phase when the read fails and no lobby answers either", async () => {
        draw({
            [LIVE]: { body: { message: "Hỏng" }, status: 500 },
            [LOBBY]: { body: { message: "Hỏng" }, status: 500 },
        })
        expect(await screen.findByRole("alert")).toBeTruthy()
    })
})

describe("the console's phase machine — Về sảnh", () => {
    /** How many times the live view was read (the engine's confirmation channel). */
    const liveReads = (fetchMock: ReturnType<typeof stubFetch>) =>
        fetchMock.mock.calls.filter(([url]) => String(url) === LIVE_PATH).length

    it("lands on the waiting room WITHOUT waiting for the engine to agree", async () => {
        const { fetchMock } = draw()
        const back = await screen.findByRole("button", { name: "Về sảnh" })
        const readsBefore = liveReads(fetchMock)

        await userEvent.click(back)

        // The pushed view still says "phase2, a question is open" — the console
        // must nevertheless stop drawing the deck. That is atWaiting's whole job.
        expect(await screen.findByRole("heading", { level: 1, name: "Tournament" })).toBeTruthy()
        expect(screen.queryByRole("button", { name: "Về sảnh" })).toBeNull()
        // and the end plan went out: one action for khoi-dong phase 2 (endRound)
        const sent = fetchMock.mock.calls.map(([url, init]) => `${init?.method ?? "GET"} ${String(url)}`)
        expect(sent).toContain(ACTIONS)
        expect(readsBefore).toBeGreaterThan(0)
    })

    it("stays on the waiting room even after the action re-reads the live view", async () => {
        // the end action invalidates /live; the engine still answers "phase2"
        // (it is mid-round for another console, or slow). atWaiting must hold.
        const { fetchMock } = draw()
        await userEvent.click(await screen.findByRole("button", { name: "Về sảnh" }))
        const readsAfterClick = liveReads(fetchMock)

        await waitFor(() => expect(liveReads(fetchMock)).toBeGreaterThanOrEqual(readsAfterClick))
        expect(screen.getByRole("heading", { level: 1, name: "Tournament" })).toBeTruthy()
        expect(screen.queryByRole("button", { name: "Về sảnh" })).toBeNull()
    })

    it("still offers the rounds navigator from the waiting room", async () => {
        draw()
        await userEvent.click(await screen.findByRole("button", { name: "Về sảnh" }))
        // the console can start a round again without leaving the lobby
        expect(await screen.findByRole("button", { name: /Khởi động · Chung/ })).toBeTruthy()
    })
})

describe("the waiting room before the match is LIVE", () => {
    it("is the ROUNDS navigator, not a lone start button", async () => {
        draw({ [LIVE]: { body: { message: "Trận chưa mở" }, status: 409 } })

        // the operator's unit of work is the round: the same room they get between rounds
        expect(await screen.findByRole("button", { name: /Khởi động · Riêng/ })).toBeInTheDocument()
        expect(screen.queryByRole("button", { name: /Bắt đầu trận/ })).toBeNull()
    })

    it("brings the match LIVE and starts the picked round in one gesture", async () => {
        const { fetchMock } = draw({
            [LIVE]: { body: { message: "Trận chưa mở" }, status: 409 },
            [STATUS]: { body: { id: M, status: "LIVE" } },
        })
        // Once the match is LIVE, the live read answers a view: the phase re-reads it
        // for the version the start must carry.
        const base = fetchMock.getMockImplementation()!
        let wentLive = false
        fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
            const key = `${init?.method ?? "GET"} ${String(input)}`
            if (key === STATUS) wentLive = true
            if (key === LIVE && wentLive) {
                return { ok: true, status: 200, statusText: "", json: async () => liveView() } as unknown as Response
            }
            return base(input, init)
        })

        await userEvent.click(await screen.findByRole("button", { name: /Khởi động · Riêng/ }))

        // 1) the match goes LIVE …
        await waitFor(() => {
            const call = fetchMock.mock.calls.find(([url, init]) => `${init?.method ?? "GET"} ${String(url)}` === STATUS)
            expect(call).toBeTruthy()
            expect(JSON.parse(String(call![1]?.body))).toEqual({ status: "LIVE" })
        })
        // … 2) and the round is started with an action
        await waitFor(() => {
            const sent = fetchMock.mock.calls
                .filter(([url, init]) => `${init?.method ?? "GET"} ${String(url)}` === ACTIONS)
                .map(([, init]) => JSON.parse(String(init?.body)))
            expect(sent.length).toBeGreaterThan(0)
        })
    })

    it("shows why a start was refused, with the API's reasons", async () => {
        draw({
            [LIVE]: { body: { message: "Trận chưa mở" }, status: 409 },
            [STATUS]: {
                body: { message: "match m1 is not ready to go live", details: ["no questions assembled"] },
                status: 409,
            },
        })

        await userEvent.click(await screen.findByRole("button", { name: /Khởi động · Riêng/ }))
        expect(await screen.findByRole("alert")).toHaveTextContent(/no questions assembled/)
    })
})
