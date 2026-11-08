import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, useLocation } from "react-router-dom"
import { describe, expect, it, vi } from "vitest"
import { NavBar } from "@/components/layout/NavBar"


interface StubRoute { body: unknown; status?: number }

const ME = "GET /gameplay/auth/me"
const MATCHES = "GET /gameplay/me/match"
const Tournaments = "GET /gameplay/tournaments"

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
    it("offers the door to the account the desk issued — no signup, no separate code link (step 8)", async () => {
        draw({ ...signedOut, ...noTournaments })
        expect(await screen.findByRole("link", { name: "Đăng nhập" })).toBeTruthy()
        expect(screen.queryByRole("link", { name: "Nhập mã" })).toBeNull()
        expect(screen.queryByRole("link", { name: "Đăng ký" })).toBeNull()
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

    it("one seat → listed in the dialog, one click deeper to the deck", async () => {
        draw({ ...signedIn, ...noTournaments, ...oneMatch })
        await screen.findByText("An")

        await userEvent.click(screen.getByRole("button", { name: "Vào trận" }))
        const dialog = await screen.findByRole("dialog")
        await userEvent.click(within(dialog).getByRole("button", { name: /Chung kết/ }))
        await waitFor(() => expect(screen.getByText("landed at /s/cup/matches/m1")).toBeTruthy())
    })

    it("no seat → the dialog is just the code box, not a dead navigation", async () => {
        draw({ ...signedIn, ...noTournaments, [MATCHES]: { body: { items: [] } } })
        await screen.findByText("An")

        await userEvent.click(screen.getByRole("button", { name: "Vào trận" }))
        const dialog = await screen.findByRole("dialog")
        expect(within(dialog).getByLabelText("Mã phòng")).toBeTruthy()
        expect(screen.queryByText(/^landed at/)).toBeNull()
    })

    it("several seats → listed in the dialog to pick from", async () => {
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
        const dialog = await screen.findByRole("dialog")

        await userEvent.click(within(dialog).getByRole("button", { name: /Chung kết/ }))
        await waitFor(() => expect(screen.getByText("landed at /s/cup/matches/m1")).toBeTruthy())
    })

    it("an unreadable seat list is an answer, not a silent failure", async () => {
        draw({ ...signedIn, ...noTournaments, [MATCHES]: { status: 500, body: { message: "boom" } } })
        await screen.findByText("An")

        await userEvent.click(screen.getByRole("button", { name: "Vào trận" }))
        const dialog = await screen.findByRole("dialog")
        expect(within(dialog).getByRole("status")).toHaveTextContent(/Không đọc được danh sách trận/)
    })
})

describe("NavBar — one button, code box inside", () => {
    it("signed out: no code box — Đăng nhập is the only door", async () => {
        draw({ ...signedOut, ...noTournaments })

        expect(await screen.findByRole("link", { name: "Đăng nhập" })).toBeTruthy()
        expect(screen.queryByRole("link", { name: "Nhập mã" })).toBeNull()
    })

    it("signed in: the single Vào trận button opens the code box", async () => {
        draw({ ...signedIn, ...noTournaments, ...oneMatch })
        await screen.findByText("An")

        expect(screen.queryByRole("link", { name: "Nhập mã" })).toBeNull()
        await userEvent.click(screen.getByRole("button", { name: "Vào trận" }))
        const dialog = await screen.findByRole("dialog")
        expect(within(dialog).getByLabelText("Mã phòng")).toBeTruthy()
        expect(within(dialog).getByRole("button", { name: "Vào trận" })).toBeTruthy()
    })
})
