import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ResultsNav } from "@/App"

function draw(routes: Record<string, { body: unknown; status?: number }>) {
    const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const key = `${init?.method ?? "GET"} ${String(input)}`
        const route = routes[key]
        if (!route) throw new Error(`unexpected request: ${key}`)
        return {
            ok: route.status === undefined || (route.status >= 200 && route.status < 300),
            status: route.status ?? 200,
            statusText: "",
            json: async () => route.body,
        } as unknown as Response
    })
    vi.stubGlobal("fetch", mock)

    const client = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    render(
        <QueryClientProvider client={client}>
            <MemoryRouter>
                <ResultsNav />
            </MemoryRouter>
        </QueryClientProvider>,
    )
}

describe("ResultsNav — Vào trận", () => {
    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it("opens the enter-match dialog for a signed-in player", async () => {
        draw({
            "GET /gameplay/tournaments": { body: { tournaments: [] } },
            "GET /gameplay/auth/me": { body: { id: "u1", displayName: "An", role: "PLAYER" } },
            "GET /gameplay/me/match": { body: { items: [] } },
        })

        const user = userEvent.setup()
        const button = await screen.findByRole("button", { name: "Vào trận" })
        await user.click(button)

        expect(await screen.findByRole("dialog")).toBeInTheDocument()
        expect(screen.getByText("Mã phòng")).toBeInTheDocument()
    })
})
