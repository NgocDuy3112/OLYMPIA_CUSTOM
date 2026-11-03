// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { afterEach, describe, expect, it, vi } from "vitest"
import { JoinPage } from "@/pages/JoinPage"

// The player's door: a PIN, then your name. It is drawn INSIDE the deck's frame —
// the first screen of the show a player sees should look like the deck they are
// about to sit in — but as a FORM, so the canvas fills the viewport instead of
// holding 16:9 (a 390 px phone would otherwise clip the card).

const LOOKUP = "POST /gameplay/join/lookup"
const CLAIM = "POST /gameplay/join/claim"
const METHODS = "GET /gameplay/auth/methods"

const seats = [
    { userId: "u1", displayName: "An" },
    { userId: "u2", displayName: "Bình" },
]

function json(body: unknown, status = 200): Response {
    return { ok: status >= 200 && status < 300, status, statusText: "", json: async () => body } as unknown as Response
}

function draw(routes: Record<string, { body: unknown; status?: number }>, entry = "/join") {
    const calls: Array<{ key: string; body: unknown }> = []
    const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const key = `${init?.method ?? "GET"} ${String(input)}`
        calls.push({ key, body: init?.body ? JSON.parse(String(init.body)) : null })
        const route = routes[key] ?? (key === METHODS ? { body: { pin: true, google: false } } : undefined)
        if (!route) throw new Error(`unexpected request: ${key}`)
        return json(route.body, route.status)
    })
    vi.stubGlobal("fetch", mock)

    // the page asks /gameplay/auth/methods, so it needs a query client
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    render(
        <QueryClientProvider client={client}>
            <MemoryRouter initialEntries={[entry]}>
                <Routes>
                    <Route path="/join" element={<JoinPage />} />
                    <Route path="/s/:slug/matches/:id" element={<p>deck here</p>} />
                </Routes>
            </MemoryRouter>
        </QueryClientProvider>
    )
    return { calls, mock }
}

const codeField = () => screen.getByLabelText("Mã vào trận")
/** The OTP input is a single field: typing into it advances the slots. */
const typeCode = async (text: string) => userEvent.type(codeField(), text)

afterEach(cleanup)

describe("the PIN door lives inside the deck's frame", () => {
    it("renders into the deck canvas, filling the viewport (a form, not a 16:9 deck)", () => {
        draw({})
        const canvas = document.querySelector(".\\@container")
        expect(canvas).not.toBeNull()
        // fullHeight: the phone case must not be a 219 px letterbox
        expect(canvas?.className).toContain("min-h-dvh")
        expect(canvas?.className).not.toContain("aspect-video")
    })
})

describe("entering a code — no submit step", () => {
    it("offers no submit button at all: the sixth character is the trigger", () => {
        draw({})
        expect(codeField()).toBeInTheDocument()
        expect(screen.queryByRole("button", { name: /^Vào/ })).toBeNull()
    })

    it("looks the code up by itself once six characters are in", async () => {
        const { calls } = draw({
            [LOOKUP]: { body: { matchId: "m1", slug: "cup", label: "Chung kết", status: "LIVE", seats } },
        })
        await typeCode("FIX12")
        // five characters is not a code: nothing has been asked
        // (the mount-time /auth/methods call is not a lookup)
        expect(calls.filter((call) => call.key === LOOKUP)).toHaveLength(0)
        await typeCode("3")
        expect(await screen.findByText("Bạn là ai?")).toBeInTheDocument()
        expect(calls.at(-1)).toEqual({ key: LOOKUP, body: { code: "FIX123" } })
    })

    it("upper-cases the code before asking (the server compares upper case)", async () => {
        const { calls } = draw({
            [LOOKUP]: { body: { matchId: "m1", slug: "cup", label: "Chung kết", status: "LIVE", seats } },
            [CLAIM]: { body: { matchId: "m1", slug: "cup" } },
        })
        await userEvent.type(codeField(), "fix123")
        expect(await screen.findByRole("button", { name: "An" })).toBeInTheDocument()
        expect(calls.at(-1)).toEqual({ key: LOOKUP, body: { code: "FIX123" } })
    })

    it("tapping a name IS entering — the claim names the deck's route", async () => {
        const { calls } = draw({
            [LOOKUP]: { body: { matchId: "m1", slug: "cup", label: "Chung kết", status: "LIVE", seats } },
            [CLAIM]: { body: { matchId: "m1", slug: "cup" } },
        })
        await typeCode("FIX123")
        expect(await screen.findByText(/Chung kết/)).toBeInTheDocument()
        expect(screen.getByText(/đang diễn ra/)).toBeInTheDocument()

        await userEvent.click(screen.getByRole("button", { name: "Bình" }))
        expect(await screen.findByText("deck here")).toBeInTheDocument()
        // the claim carries the seat; the session change then invalidates queries,
        // so the last call is a refetch — look the claim up, not "the last one"
        expect(calls.find((call) => call.key === CLAIM)).toEqual({
            key: CLAIM,
            body: { code: "FIX123", userId: "u2" },
        })
    })

    it("clears the seats when the code is edited again", async () => {
        draw({ [LOOKUP]: { body: { matchId: "m1", slug: "cup", label: "Chung kết", status: "LIVE", seats } } })
        await typeCode("FIX123")
        await screen.findByText("Bạn là ai?")
        await userEvent.click(screen.getByRole("button", { name: "Nhập mã khác" }))
        // the seats belonged to that code, not to the screen
        await waitFor(() => expect(screen.queryByText("Bạn là ai?")).toBeNull())
    })
})

describe("refusals", () => {
    it("says the code is wrong (404) without blaming the player", async () => {
        draw({ [LOOKUP]: { body: { message: "not found" }, status: 404 } })
        await typeCode("ZZZZZZ")
        expect(await screen.findByText(/Mã không đúng/)).toBeInTheDocument()
    })

    it("says the seat is not theirs (403) instead of failing silently", async () => {
        draw({
            [LOOKUP]: { body: { matchId: "m1", slug: "cup", label: "Chung kết", status: "LIVE", seats } },
            [CLAIM]: { body: { message: "no" }, status: 403 },
        })
        await typeCode("FIX123")
        await userEvent.click(await screen.findByRole("button", { name: "An" }))
        expect(await screen.findByRole("alert")).toHaveTextContent(/Ghế này không thuộc về bạn/)
    })

    it("says when the match has no seats yet", async () => {
        draw({ [LOOKUP]: { body: { matchId: "m1", slug: "cup", label: "Chung kết", status: "UPCOMING", seats: [] } } })
        await typeCode("FIX123")
        expect(await screen.findByText(/chưa có ghế/)).toBeInTheDocument()
    })
})

describe("the sign-in this deployment actually has", () => {
    it("offers no Google link when Google is not configured", async () => {
        draw({})
        // the page must never render a button that dead-ends in a 503
        await waitFor(() => expect(screen.queryByText(/đăng nhập bằng Google/i)).toBeNull())
        expect(codeField()).toBeInTheDocument()
    })

    it("offers Google when the deployment has it, remembering where to return", async () => {
        draw({ [METHODS]: { body: { pin: true, google: true } } })
        const link = await screen.findByRole("link", { name: /đăng nhập bằng Google/i })
        expect(link.getAttribute("href")).toContain("/gameplay/auth/google?next=")
    })

    it("explains itself when a stale Google link sent the player here", async () => {
        draw({}, "/join?notice=google-off")
        expect(await screen.findByText(/Google chưa được cấu hình/)).toBeInTheDocument()
        // and the PIN door is right there
        expect(codeField()).toBeInTheDocument()
    })

    it("says nothing about Google on an ordinary visit", async () => {
        draw({})
        await waitFor(() => expect(screen.queryByText(/Google/)).toBeNull())
    })
})
