import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom"
import { describe, expect, it, vi } from "vitest"
import { CodePage } from "@/pages/CodePage"


interface StubRoute { body: unknown; status?: number }

function WhereAmI() {
    const location = useLocation()
    return <p>landed at {location.pathname}</p>
}

const ME = "GET /gameplay/auth/me"
const CLAIM = "POST /gameplay/join/claim"

function draw(routes: Record<string, StubRoute>, entry = "/code") {
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
                <Routes>
                    <Route path="/code" element={<CodePage />} />
                    <Route path="*" element={<WhereAmI />} />
                </Routes>
            </MemoryRouter>
        </QueryClientProvider>
    )
    return { ...result, fetchMock: mock }
}

const signedOut = { [ME]: { status: 401, body: { message: "no session" } } }
const signedIn = { [ME]: { body: { id: "u1", displayName: "An", role: "PLAYER" } } }

describe("CodePage — signed out", () => {
    it("sends the player to the login door, with this page waiting as ?next=", async () => {
        draw({ ...signedOut })

        const door = await screen.findByRole("link", { name: "Đăng nhập" })
        expect(door.getAttribute("href")).toBe("/login?next=%2Fcode")
        expect(screen.queryByLabelText("Mã phòng")).toBeNull()
    })

    it("sends an account-less walk-in to the DESK, not to a form — signup is gone", async () => {
        draw({ ...signedOut })
        await screen.findByRole("link", { name: "Đăng nhập" })
        expect(screen.queryByRole("link", { name: "Đăng ký" })).toBeNull()
        expect(screen.getByText(/không tự đăng ký/)).toBeInTheDocument()
    })
})

describe("CodePage — signed in", () => {
    it("seats the player with the code and lands them on the deck", async () => {
        const { fetchMock } = draw({
            ...signedIn,
            [CLAIM]: { body: { matchId: "m1", slug: "cup", label: "Chung kết" } },
        })

        await screen.findByText("Nhập mã vào trận")
        await userEvent.type(screen.getByLabelText("Mã phòng"), "ABC234")
        await userEvent.click(screen.getByRole("button", { name: "Vào trận" }))

        await waitFor(() => expect(screen.getByText("landed at /s/cup/matches/m1")).toBeTruthy())
        const call = fetchMock.mock.calls.find(([input]) => String(input).includes("/join/claim"))
        expect(JSON.parse(String(call![1]?.body))).toEqual({ code: "ABC234" })
    })

    it("keeps the server's refusal: unknown, expired, or a full table", async () => {
        draw({
            ...signedIn,
            [CLAIM]: { body: { message: "Mã không đúng hoặc đã hết hạn — xin hỏi lại ban điều hành." }, status: 404 },
        })

        await screen.findByText("Nhập mã vào trận")
        await userEvent.type(screen.getByLabelText("Mã phòng"), "SAI234")
        await userEvent.click(screen.getByRole("button", { name: "Vào trận" }))

        expect(await screen.findByRole("alert")).toHaveTextContent(/không đúng hoặc đã hết hạn/)
        expect(screen.getByLabelText("Mã phòng")).toBeTruthy()
    })

    it("says the session is gone when the claim comes back 401, and offers the door", async () => {
        draw({
            ...signedIn,
            [CLAIM]: { body: { message: "Missing session cookie" }, status: 401 },
        })

        await screen.findByText("Nhập mã vào trận")
        await userEvent.type(screen.getByLabelText("Mã phòng"), "ABC234")
        await userEvent.click(screen.getByRole("button", { name: "Vào trận" }))

        const notice = await screen.findByRole("status")
        expect(notice).toHaveTextContent(/Phiên đã hết hạn/)
        expect(notice.querySelector("a")?.getAttribute("href")).toBe("/login?next=%2Fcode")
    })

    it("will not send an empty code", async () => {
        const { fetchMock } = draw({ ...signedIn })

        await screen.findByText("Nhập mã vào trận")
        expect(screen.getByRole("button", { name: "Vào trận" })).toBeDisabled()

        await userEvent.type(screen.getByLabelText("Mã phòng"), "   ")
        await userEvent.click(screen.getByRole("button", { name: "Vào trận" }))
        expect(fetchMock.mock.calls.some(([input]) => String(input).includes("/join/claim"))).toBe(false)
    })
})
