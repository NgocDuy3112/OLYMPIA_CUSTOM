import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom"
import { describe, expect, it, vi } from "vitest"
import { ChangePasswordPage } from "@/pages/ChangePasswordPage"
import { LoginPage } from "@/pages/LoginPage"

function WhereAmI() {
    const location = useLocation()
    return <p>landed at {location.pathname}</p>
}


interface StubRoute { body: unknown; status?: number }

function draw(routes: Record<string, StubRoute>, entry = "/login") {
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
                    <Route path="/login" element={<LoginPage />} />
                    <Route path="/password" element={<ChangePasswordPage />} />
                    <Route path="*" element={<WhereAmI />} />
                </Routes>
            </MemoryRouter>
        </QueryClientProvider>
    )
    return { ...result, fetchMock: mock }
}

const ME = "GET /gameplay/auth/me"
const LOGIN = "POST /gameplay/auth/login"
const CHANGE = "POST /gameplay/auth/change-password"

const signedIn = { [ME]: { body: { id: "u1", displayName: "Ngọc Duy", username: "ngoc-duy", role: "PLAYER" } } }
const signedOut = { [ME]: { status: 401, body: { message: "no session" } } }

describe("LoginPage", () => {
    it("asks for the HANDLE the desk issued — no email field, no signup link", () => {
        draw({})

        expect(screen.getByLabelText("Tên đăng nhập")).toBeTruthy()
        expect(screen.getByLabelText("Mật khẩu")).toBeTruthy()
        expect(screen.queryByRole("link", { name: "Đăng ký" })).toBeNull()
        expect(screen.getByText(/thí sinh không tự đăng ký/)).toBeTruthy()
    })

    it("sends { username, password } — the key the backend looks up", async () => {
        const { fetchMock } = draw({ [LOGIN]: { body: { id: "u1", username: "ngoc-duy", displayName: "Ngọc Duy", mustChangePassword: false } } })

        await userEvent.type(screen.getByLabelText("Tên đăng nhập"), "  Ngoc-Duy ")
        await userEvent.type(screen.getByLabelText("Mật khẩu"), "mat-khau-cua-toi")
        await userEvent.click(screen.getByRole("button", { name: "Đăng nhập" }))

        await waitFor(() => expect(screen.getByText("landed at /")).toBeTruthy())
        const call = fetchMock.mock.calls.find(([input]) => String(input).includes("/auth/login"))
        expect(JSON.parse(String(call![1]?.body))).toEqual({ username: "Ngoc-Duy", password: "mat-khau-cua-toi" })
    })

    it("goes to ?next= after a sign-in that is already the player's own", async () => {
        draw({ [LOGIN]: { body: { id: "u1", username: "an", displayName: "An", mustChangePassword: false } } },
            "/login?next=%2Fs%2Fcup%2Fmatches%2Fm1")

        await userEvent.type(screen.getByLabelText("Tên đăng nhập"), "an")
        await userEvent.type(screen.getByLabelText("Mật khẩu"), "mat-khau-42")
        await userEvent.click(screen.getByRole("button", { name: "Đăng nhập" }))

        await waitFor(() => expect(screen.getByText("landed at /s/cup/matches/m1")).toBeTruthy())
    })

    it("refuses a //host next= — it can only send a player inside this app", async () => {
        draw({ [LOGIN]: { body: { id: "u1", username: "an", displayName: "An", mustChangePassword: false } } },
            "/login?next=%2F%2Fevil.example")

        await userEvent.type(screen.getByLabelText("Tên đăng nhập"), "an")
        await userEvent.type(screen.getByLabelText("Mật khẩu"), "mat-khau-42")
        await userEvent.click(screen.getByRole("button", { name: "Đăng nhập" }))

        await waitFor(() => expect(screen.getByText("landed at /")).toBeTruthy())
    })

    it("sends the DESK's first password straight to /password, carrying ?next=", async () => {
        draw({
            ...signedIn,
            [LOGIN]: { body: { id: "u1", username: "moi", displayName: "Mới", mustChangePassword: true } },
        }, "/login?next=%2Fcode")

        await userEvent.type(screen.getByLabelText("Tên đăng nhập"), "moi")
        await userEvent.type(screen.getByLabelText("Mật khẩu"), "mat-khau-ban-2026")
        await userEvent.click(screen.getByRole("button", { name: "Đăng nhập" }))

        await waitFor(() => expect(screen.getByLabelText("Mật khẩu ban điều hành cấp")).toBeTruthy())
    })

    it("shows the server's single message for a wrong password or unknown handle", async () => {
        draw({
            [LOGIN]: { body: { message: "Tên đăng nhập hoặc mật khẩu không đúng." }, status: 401 },
        }, "/login")

        await userEvent.type(screen.getByLabelText("Tên đăng nhập"), "sai-cai-nay")
        await userEvent.type(screen.getByLabelText("Mật khẩu"), "sai-het")
        await userEvent.click(screen.getByRole("button", { name: "Đăng nhập" }))

        expect(await screen.findByRole("alert")).toHaveTextContent(/Tên đăng nhập hoặc mật khẩu không đúng/)
    })

    it("explains a Google link that could not start", () => {
        draw({}, "/login?notice=google-off")
        expect(screen.getByText(/chưa được cấu hình/)).toBeTruthy()
    })
})

describe("ChangePasswordPage — where the desk's password ends", () => {
    it("asks for the current password, the new one, and a repeat", () => {
        draw({ ...signedIn }, "/password")

        expect(screen.getByLabelText("Mật khẩu ban điều hành cấp")).toBeTruthy()
        expect(screen.getByLabelText("Mật khẩu mới")).toBeTruthy()
        expect(screen.getByLabelText("Nhập lại mật khẩu mới")).toBeTruthy()
        expect(screen.getByText(/ban điều hành cấp mật khẩu đầu tiên/)).toBeTruthy()
    })

    it("refuses a repeat that does not match, without sending anything", async () => {
        const { fetchMock } = draw({ ...signedIn }, "/password")

        await userEvent.type(screen.getByLabelText("Mật khẩu ban điều hành cấp"), "mat-khau-ban-2026")
        await userEvent.type(screen.getByLabelText("Mật khẩu mới"), "mat-khau-moi-123")
        await userEvent.type(screen.getByLabelText("Nhập lại mật khẩu mới"), "khac-nhau-het")
        await userEvent.click(screen.getByRole("button", { name: "Đặt mật khẩu" }))

        expect(await screen.findByRole("alert")).toHaveTextContent(/chưa giống nhau/)
        expect(fetchMock.mock.calls.some(([input]) => String(input).includes("/change-password"))).toBe(false)
    })

    it("saves the player's own password and goes back to where the gate found them", async () => {
        draw({ ...signedIn, [CHANGE]: { body: { ok: true, displayName: "Ngọc Duy" } } },
            "/password?next=%2Fs%2Fcup%2Fmatches%2Fm1")

        await userEvent.type(screen.getByLabelText("Mật khẩu ban điều hành cấp"), "mat-khau-ban-2026")
        await userEvent.type(screen.getByLabelText("Mật khẩu mới"), "mat-khau-moi-123")
        await userEvent.type(screen.getByLabelText("Nhập lại mật khẩu mới"), "mat-khau-moi-123")
        await userEvent.click(screen.getByRole("button", { name: "Đặt mật khẩu" }))

        await waitFor(() => expect(screen.getByText("landed at /s/cup/matches/m1")).toBeTruthy())
    })

    it("keeps the SERVER's refusal to the current password on the form", async () => {
        draw({
            ...signedIn,
            [CHANGE]: { body: { message: "Mật khẩu hiện tại không đúng." }, status: 401 },
        }, "/password")

        await userEvent.type(screen.getByLabelText("Mật khẩu ban điều hành cấp"), "sai-het")
        await userEvent.type(screen.getByLabelText("Mật khẩu mới"), "mat-khau-moi-123")
        await userEvent.type(screen.getByLabelText("Nhập lại mật khẩu mới"), "mat-khau-moi-123")
        await userEvent.click(screen.getByRole("button", { name: "Đặt mật khẩu" }))

        expect(await screen.findByRole("alert")).toHaveTextContent(/Mật khẩu hiện tại không đúng/)
        expect(screen.getByLabelText("Mật khẩu mới")).toBeTruthy()
    })

    it("sends an expired session back to the login door, carrying both hops", async () => {
        draw({ ...signedOut }, "/password?next=%2Fcode")

        const door = await screen.findByRole("link", { name: "Đăng nhập" })
        const href = door.getAttribute("href") ?? ""
        expect(href).toContain("/login?next=")
        expect(decodeURIComponent(decodeURIComponent(href))).toContain("/password?next=/code")
        expect(screen.getByText(/đăng nhập lại bằng mật khẩu ban điều hành cấp/)).toBeTruthy()
        expect(screen.queryByLabelText("Mật khẩu mới")).toBeNull()
    })
})
