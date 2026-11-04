// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, useLocation } from "react-router-dom"
import { describe, expect, it, vi } from "vitest"
import { NavBar } from "@/components/layout/NavBar"

// The navbar is the player's whole way into a match. Each state must stand
// alone: signed out gets the two doors, signed in gets their name and ONE
// "Vào trận" that either goes somewhere, says why it cannot, or offers the
// list when they hold several seats.

interface StubRoute { body: unknown; status?: number }

const ME = "GET /gameplay/auth/me"
const MATCHES = "GET /gameplay/me/match"
const Tournaments = "GET /gameplay/tournaments"

/** Where the router landed — silent at the entry URL, so a test can tell
 *  "went somewhere" from "stayed put" by the text appearing at all. */
function WhereAmI() {
    const location = useLocation()
    if (location.pathname === "/") return null
    return <p>landed at {location.pathname}</p>
}

function draw(routes: Record<string, StubRoute>, entry = "/") {
    const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const key = `${init?.method ?? "GET"} ${String(input)}`
        const route = routes[key]
        if (!route) throw new Error(`unexpected request: ${key}`)
        const { body, status = 200 } = route
        return {
            ok: status >= 200 && status < 300,
            status,
            statusText: "",
            json: async () => body,
        } as unknown as Response
    })
    vi.stubGlobal("fetch", mock)

    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    const result = render(
        <QueryClientProvider client={client}>
            <MemoryRouter initialEntries={[entry]}>
                <NavBar />
                <WhereAmI />
            </MemoryRouter>
        </QueryClientProvider>
    )
    return { ...result, fetchMock: mock }
}

const signedOut = { [ME]: { status: 401, body: { message: "no session" } } }
const signedIn = { [ME]: { body: { id: "u1", displayName: "An", role: "PLAYER" } } }
const noTournaments = { [Tournaments]: { body: { tournaments: [] } } }
const oneMatch = {
    [MATCHES]: {
        body: {
            items: [{ matchId: "m1", label: "Chung kết", status: "LIVE", scheduledAt: "", slug: "cup", tournamentName: "Cúp A" }],
        },
    },
}

describe("NavBar — signed out", () => {
    it("offers both doors to the account the player owns", async () => {
        draw({ ...signedOut, ...noTournaments })
        expect(await screen.findByRole("link", { name: "Đăng nhập" })).toBeTruthy()
        expect(screen.getByRole("link", { name: "Đăng ký" })).toBeTruthy()
        expect(screen.queryByRole("button", { name: "Vào trận" })).toBeNull()
    })

    it("remembers where the player was as ?next=", async () => {
        draw({ ...signedOut, ...noTournaments }, "/standings")
        const door = await screen.findByRole("link", { name: "Đăng nhập" })
        expect(door.getAttribute("href")).toBe("/login?next=%2Fstandings")
    })
})

describe("NavBar — signed in", () => {
    it("shows the player's name", async () => {
        draw({ ...signedIn, ...noTournaments, ...oneMatch })
        expect(await screen.findByText("An")).toBeTruthy()
    })

    it("one seat → the deck, in one click", async () => {
        draw({ ...signedIn, ...noTournaments, ...oneMatch })
        await screen.findByText("An")

        await userEvent.click(screen.getByRole("button", { name: "Vào trận" }))
        await waitFor(() => expect(screen.getByText("landed at /s/cup/matches/m1")).toBeTruthy())
    })

    it("no seat → says why, instead of a dead navigation", async () => {
        draw({ ...signedIn, ...noTournaments, [MATCHES]: { body: { items: [] } } })
        await screen.findByText("An")

        await userEvent.click(screen.getByRole("button", { name: "Vào trận" }))
        expect(await screen.findByRole("status")).toHaveTextContent(/chưa có trận/)
        expect(screen.queryByText(/^landed at/)).toBeNull()
    })

    it("several seats → a list to pick from, newest first already", async () => {
        draw({
            ...signedIn,
            ...noTournaments,
            [MATCHES]: {
                body: {
                    items: [
                        { matchId: "m2", label: "Bán kết", status: "UPCOMING", scheduledAt: "", slug: "cup", tournamentName: "Cúp A" },
                        { matchId: "m1", label: "Chung kết", status: "LIVE", scheduledAt: "", slug: "cup", tournamentName: "Cúp A" },
                    ],
                },
            },
        })
        await screen.findByText("An")

        await userEvent.click(screen.getByRole("button", { name: "Vào trận" }))
        const list = await screen.findByRole("menu", { name: "Chọn trận" })
        expect(list).toBeTruthy()

        await userEvent.click(screen.getByRole("menuitem", { name: /Chung kết/ }))
        await waitFor(() => expect(screen.getByText("landed at /s/cup/matches/m1")).toBeTruthy())
    })

    it("an unreadable seat list is an answer, not a silent failure", async () => {
        draw({ ...signedIn, ...noTournaments, [MATCHES]: { status: 500, body: { message: "boom" } } })
        await screen.findByText("An")

        await userEvent.click(screen.getByRole("button", { name: "Vào trận" }))
        expect(await screen.findByRole("status")).toHaveTextContent(/Không đọc được danh sách trận/)
    })
})

describe("NavBar — the other way in (a room code)", () => {
    it("signed out: «Nhập mã» goes to the login door first, carrying the code box", async () => {
        draw({ ...signedOut, ...noTournaments })

        const door = await screen.findByRole("link", { name: "Nhập mã" })
        expect(door.getAttribute("href")).toBe("/login?next=%2Fcode")
    })

    it("signed in: «Nhập mã» sits beside Vào trận and opens the code box", async () => {
        draw({ ...signedIn, ...noTournaments, ...oneMatch })
        await screen.findByText("An")

        const box = await screen.findByRole("link", { name: "Nhập mã" })
        expect(box.getAttribute("href")).toBe("/code")
        // the one-click path for a seated player is untouched
        expect(screen.getByRole("button", { name: "Vào trận" })).toBeTruthy()
    })
})
