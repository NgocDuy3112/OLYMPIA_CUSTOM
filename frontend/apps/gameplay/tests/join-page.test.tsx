// @vitest-environment jsdom
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

const seats = [
    { userId: "u1", displayName: "An" },
    { userId: "u2", displayName: "Bình" },
]

function json(body: unknown, status = 200): Response {
    return { ok: status >= 200 && status < 300, status, statusText: "", json: async () => body } as unknown as Response
}

function draw(routes: Record<string, { body: unknown; status?: number }>) {
    const calls: Array<{ key: string; body: unknown }> = []
    const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const key = `${init?.method ?? "GET"} ${String(input)}`
        calls.push({ key, body: init?.body ? JSON.parse(String(init.body)) : null })
        const route = routes[key]
        if (!route) throw new Error(`unexpected request: ${key}`)
        return json(route.body, route.status)
    })
    vi.stubGlobal("fetch", mock)

    render(
        <MemoryRouter initialEntries={["/join"]}>
            <Routes>
                <Route path="/join" element={<JoinPage />} />
                <Route path="/s/:slug/matches/:id" element={<p>deck here</p>} />
            </Routes>
        </MemoryRouter>
    )
    return { calls, mock }
}

const codeField = () => screen.getByLabelText("Mã vào trận")
const joinButton = () => screen.getByRole("button", { name: /^Vào$/ })

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

describe("entering a code", () => {
    it("keeps the button disabled until six characters are in", async () => {
        draw({})
        expect(joinButton()).toBeDisabled()
        await userEvent.type(codeField(), "FIX12")
        expect(joinButton()).toBeDisabled()
        await userEvent.type(codeField(), "3")
        await waitFor(() => expect(joinButton()).toBeEnabled())
    })

    it("upper-cases what the player types", async () => {
        draw({ [LOOKUP]: { body: { matchId: "m1", slug: "cup", label: "Chung kết", status: "LIVE", seats } } })
        await userEvent.type(codeField(), "fix123")
        expect((codeField() as HTMLInputElement).value).toBe("FIX123")
    })

    it("asks the backend and shows the seats, then claims the one you tap", async () => {
        const { calls } = draw({
            [LOOKUP]: { body: { matchId: "m1", slug: "cup", label: "Chung kết", status: "LIVE", seats } },
            [CLAIM]: { body: { matchId: "m1", slug: "cup" } },
        })

        await userEvent.type(codeField(), "FIX123")
        await userEvent.click(joinButton())

        expect(await screen.findByText("Bạn là ai?")).toBeInTheDocument()
        expect(screen.getByText(/Chung kết/)).toBeInTheDocument()
        expect(screen.getByText(/đang diễn ra/)).toBeInTheDocument()
        expect(calls.at(-1)?.body).toEqual({ code: "FIX123" })

        await userEvent.click(screen.getByRole("button", { name: "Bình" }))
        // the claim names the deck's route — the player lands there, not on a menu
        expect(await screen.findByText("deck here")).toBeInTheDocument()
        expect(calls.at(-1)).toEqual({ key: CLAIM, body: { code: "FIX123", userId: "u2" } })
    })

    it("locks the field once the seats are shown (the code is answered)", async () => {
        draw({ [LOOKUP]: { body: { matchId: "m1", slug: "cup", label: "Chung kết", status: "LIVE", seats } } })
        await userEvent.type(codeField(), "FIX123")
        await userEvent.click(joinButton())
        await screen.findByText("Bạn là ai?")
        expect(codeField()).toBeDisabled()
        await userEvent.click(screen.getByRole("button", { name: "Nhập mã khác" }))
        await waitFor(() => expect(codeField()).toBeEnabled())
    })
})

describe("refusals", () => {
    it("says the code is wrong (404) without blaming the player", async () => {
        draw({ [LOOKUP]: { body: { message: "not found" }, status: 404 } })
        await userEvent.type(codeField(), "ZZZZZZ")
        await userEvent.click(joinButton())
        expect(await screen.findByRole("alert")).toHaveTextContent(/Mã không đúng/)
    })

    it("says the seat is not theirs (403) instead of failing silently", async () => {
        draw({
            [LOOKUP]: { body: { matchId: "m1", slug: "cup", label: "Chung kết", status: "LIVE", seats } },
            [CLAIM]: { body: { message: "no" }, status: 403 },
        })
        await userEvent.type(codeField(), "FIX123")
        await userEvent.click(joinButton())
        await userEvent.click(await screen.findByRole("button", { name: "An" }))
        expect(await screen.findByRole("alert")).toHaveTextContent(/Ghế này không thuộc về bạn/)
    })

    it("says when the match has no seats yet", async () => {
        draw({ [LOOKUP]: { body: { matchId: "m1", slug: "cup", label: "Chung kết", status: "UPCOMING", seats: [] } } })
        await userEvent.type(codeField(), "FIX123")
        await userEvent.click(joinButton())
        expect(await screen.findByText(/chưa có ghế/)).toBeInTheDocument()
    })
})
