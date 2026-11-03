// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { afterEach, describe, expect, it, vi } from "vitest"
import { PlayerShell } from "@/components/player-shell"

// The PLAYER deck's phase machine, mounted for real: a 409 is the waiting lobby,
// a live view is the round screen, an ended view is the lobby again, and a dead
// session is the PIN gate. These four are the whole of "which screen does this
// player see", and each one is an answer from the backend — never a crash.

const M = "m1"
const ME = "GET /gameplay/auth/me"
const LIVE = `GET /gameplay/matches/${M}/live`
const LOBBY = `GET /gameplay/matches/${M}/lobby`

interface StubRoute { body: unknown; status?: number }

function stub(route: StubRoute) {
    return route
}

function json({ body, status = 200 }: StubRoute): Response {
    return {
        ok: status >= 200 && status < 300,
        status,
        statusText: "",
        json: async () => body,
    } as unknown as Response
}

function draw(routes: Record<string, StubRoute>) {
    const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const key = `${init?.method ?? "GET"} ${String(input)}`
        const route = routes[key]
        if (!route) throw new Error(`unexpected request: ${key}`)
        return json(route)
    })
    vi.stubGlobal("fetch", mock)

    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    return render(
        <QueryClientProvider client={client}>
            <MemoryRouter>
                <PlayerShell matchId={M} />
            </MemoryRouter>
        </QueryClientProvider>
    )
}

const me = stub({ body: { id: "u1", displayName: "An", role: "PLAYER" } })

function lobby(over: Record<string, unknown> = {}) {
    return stub({
        body: {
            title: "Tournament",
            label: "Match",
            status: "LIVE",
            roundId: "khoi-dong",
            rounds: [{ id: "khoi-dong", name: "Khởi động", status: "playing" }],
            table: [{ id: "u1", displayName: "An", points: 10, rank: 1 }],
            connected: ["u1"],
            ...over,
        },
    })
}

function view(over: Record<string, unknown> = {}) {
    return stub({
        body: {
            matchId: M,
            roundId: "khoi-dong",
            version: 3,
            stage: "phase2",
            open: [{ questionId: "q1", deadlineAt: null, question: null }],
            table: [{ id: "u1", displayName: "An", points: 10, rank: 1 }],
            // canBuzz is what puts the band's red control on screen
            me: { id: "u1", points: 10, answered: [], canBuzz: true },
            ...over,
        },
    })
}

// gameplay has no global setup file: clean the DOM between these renders.
afterEach(cleanup)

describe("the player deck's phase machine", () => {
    it("waits in the lobby while the match is not LIVE (409, no view)", async () => {
        draw({
            [ME]: me,
            [LIVE]: stub({ body: { message: "Trận chưa mở" }, status: 409 }),
            [LOBBY]: lobby({ status: "UPCOMING" }),
        })
        // the hint is the only thing telling a player this wait is not their fault
        expect(await screen.findByText(/Chờ điều hành mở trận/)).toBeTruthy()
    })

    it("gates a dead session to the PIN card (401)", async () => {
        draw({
            [ME]: stub({ body: { message: "Hết phiên" }, status: 401 }),
            [LIVE]: stub({ body: { message: "Hết phiên" }, status: 401 }),
        })
        expect(await screen.findByText("Chưa vào trận")).toBeTruthy()
        expect(screen.getByRole("link", { name: "Nhập lại mã PIN" }).getAttribute("href")).toBe("/join")
    })

    it("draws the round screen from a live view", async () => {
        draw({ [ME]: me, [LIVE]: view() })
        // khởi động phase 2 is the buzz race: the band's only control
        expect(await screen.findByRole("button", { name: "Bấm chuông" })).toBeTruthy()
    })

    it("sends an ENDED view back to the lobby", async () => {
        draw({ [ME]: me, [LIVE]: view({ stage: "ended" }), [LOBBY]: lobby() })
        expect(await screen.findByText(/Vòng đã kết thúc/)).toBeTruthy()
        expect(screen.queryByRole("button", { name: "Bấm chuông" })).toBeNull()
    })

    it("sends an unknown round to the lobby, not to a dead screen", async () => {
        draw({ [ME]: me, [LIVE]: view({ roundId: "vong-moi" }), [LOBBY]: lobby() })
        expect(await screen.findByText(/chưa có màn hình thí sinh/)).toBeTruthy()
    })
})
