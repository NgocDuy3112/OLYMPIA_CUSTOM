// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom"
import { describe, expect, it, vi } from "vitest"
import { LoginPage } from "@/pages/LoginPage"
import { RegisterPage } from "@/pages/RegisterPage"

/** Where the router actually landed — the assertion for every ?next= test. */
function WhereAmI() {
    const location = useLocation()
    return <p>landed at {location.pathname}</p>
}

// The player's own door, mounted for real: register says "go read your mail",
// login honours ?verify= and ?next=, and both keep the SERVER's message (the
// backend answers the same thing for a wrong password and an unknown address).

interface StubRoute { body: unknown; status?: number }

function draw(routes: Record<string, StubRoute>, entry = "/register") {
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
                    <Route path="/register" element={<RegisterPage />} />
                    <Route path="*" element={<WhereAmI />} />                </Routes>
            </MemoryRouter>
        </QueryClientProvider>
    )
    return { ...result, fetchMock: mock }
}

describe("RegisterPage", () => {
    it("creates no session — it says to go read the mail", async () => {
        draw({
            "POST /gameplay/auth/register": { body: { pendingVerification: true, to: "ban@example.test" } },
        })

        await userEvent.type(screen.getByLabelText("Email"), "ban@example.test")
        await userEvent.type(screen.getByLabelText("Mật khẩu"), "mat-khau-42")
        await userEvent.click(screen.getByRole("button", { name: "Đăng ký" }))

        expect(await screen.findByText("Kiểm tra email")).toBeTruthy()
        expect(screen.getByText(/ban@example\.test/)).toBeTruthy()
        expect(screen.getByText(/24 giờ/)).toBeTruthy()
    })

    it("sends the name only when one was given", async () => {
        const { fetchMock } = draw({
            "POST /gameplay/auth/register": { body: { pendingVerification: true, to: "an@example.test" } },
        })

        await userEvent.type(screen.getByLabelText("Email"), "an@example.test")
        await userEvent.type(screen.getByLabelText("Mật khẩu"), "mat-khau-42")
        await userEvent.click(screen.getByRole("button", { name: "Đăng ký" }))

        await waitFor(() => expect(screen.findByText("Kiểm tra email")).toBeTruthy())
        const call = fetchMock.mock.calls.find(([input]) => String(input).includes("/register"))
        expect(JSON.parse(String(call![1]?.body))).toEqual({ email: "an@example.test", password: "mat-khau-42" })
    })

    it("keeps the server's refusal on the form", async () => {
        draw({
            "POST /gameplay/auth/register": { body: { message: "Email này đã có tài khoản — hãy đăng nhập." }, status: 409 },
        })

        await userEvent.type(screen.getByLabelText("Email"), "co-san@example.test")
        await userEvent.type(screen.getByLabelText("Mật khẩu"), "mat-khau-42")
        await userEvent.click(screen.getByRole("button", { name: "Đăng ký" }))

        expect(await screen.findByRole("alert")).toHaveTextContent(/đã có tài khoản/)
        // the form stays — the player can try another address
        expect(screen.getByLabelText("Email")).toBeTruthy()
    })
})

describe("LoginPage", () => {
    const LOGIN = "POST /gameplay/auth/login"

    it("carries the verify=ok verdict the mail link came back with", () => {
        draw({}, "/login?verify=ok")
        expect(screen.getByRole("status")).toHaveTextContent(/đã được xác thực/)
    })

    it("says an expired verify link is expired", () => {
        draw({}, "/login?verify=expired")
        expect(screen.getByRole("status")).toHaveTextContent(/đã hết hạn/)
    })

    it("says a garbage verify link is invalid", () => {
        draw({}, "/login?verify=invalid")
        expect(screen.getByRole("status")).toHaveTextContent(/không hợp lệ/)
    })

    it("goes to ?next= after a successful sign-in", async () => {
        draw({ [LOGIN]: { body: { id: "u1", displayName: "An", email: "an@example.test" } } },
            "/login?next=%2Fs%2Fcup%2Fmatches%2Fm1")

        await userEvent.type(screen.getByLabelText("Email"), "an@example.test")
        await userEvent.type(screen.getByLabelText("Mật khẩu"), "mat-khau-42")
        await userEvent.click(screen.getByRole("button", { name: "Đăng nhập" }))

        await waitFor(() => expect(screen.getByText("landed at /s/cup/matches/m1")).toBeTruthy())
    })

    it("refuses a //host next= — it can only send a player inside this app", async () => {
        draw({ [LOGIN]: { body: { id: "u1", displayName: "An", email: "an@example.test" } } },
            "/login?next=%2F%2Fevil.example")

        await userEvent.type(screen.getByLabelText("Email"), "an@example.test")
        await userEvent.type(screen.getByLabelText("Mật khẩu"), "mat-khau-42")
        await userEvent.click(screen.getByRole("button", { name: "Đăng nhập" }))

        // "/" is the safe destination — inside this app, never another host
        await waitFor(() => expect(screen.getByText("landed at /")).toBeTruthy())
    })

    it("shows the server's single message for a wrong password or unknown address", async () => {
        draw({
            [LOGIN]: { body: { message: "Email hoặc mật khẩu không đúng." }, status: 401 },
        }, "/login")

        await userEvent.type(screen.getByLabelText("Email"), "sai@example.test")
        await userEvent.type(screen.getByLabelText("Mật khẩu"), "sai-het")
        await userEvent.click(screen.getByRole("button", { name: "Đăng nhập" }))

        expect(await screen.findByRole("alert")).toHaveTextContent(/Email hoặc mật khẩu không đúng/)
    })

    it("says why an unverified account cannot sign in yet", async () => {
        draw({
            [LOGIN]: { body: { message: "Email chưa được xác thực — mở liên kết trong email đăng ký rồi thử lại." }, status: 403 },
        }, "/login")

        await userEvent.type(screen.getByLabelText("Email"), "chua-xac-thuc@example.test")
        await userEvent.type(screen.getByLabelText("Mật khẩu"), "mat-khau-42")
        await userEvent.click(screen.getByRole("button", { name: "Đăng nhập" }))

        expect(await screen.findByRole("alert")).toHaveTextContent(/chưa được xác thực/)
    })
})

describe("LoginPage — the desk's one-time entry code", () => {
    const ENTRY = "POST /gameplay/auth/entry-code"

    it("offers the code door under the password one, and swaps the fields", async () => {
        draw({}, "/login")
        expect(screen.getByLabelText("Email")).toBeTruthy()

        await userEvent.click(screen.getByRole("button", { name: /Quên mật khẩu/ }))
        // one card, one form: the password fields are gone, not stacked
        expect(screen.queryByLabelText("Email")).toBeNull()
        expect(screen.getByLabelText("Mã một lần")).toBeTruthy()
        expect(screen.getByText(/dùng một lần, hết hạn sau 15 phút/)).toBeTruthy()
        expect(screen.getByText(/Mật khẩu không ai biết cả/)).toBeTruthy()
    })

    it("redeems the code into the player's own session, honouring ?next=", async () => {
        const { fetchMock } = draw({ [ENTRY]: { body: { id: "u1", displayName: "An" } } }, "/login?next=%2Fcode")

        await userEvent.click(screen.getByRole("button", { name: /Quên mật khẩu/ }))
        await userEvent.type(screen.getByLabelText("Mã một lần"), "ABC234")
        await userEvent.click(screen.getByRole("button", { name: "Vào" }))

        await waitFor(() => expect(screen.getByText("landed at /code")).toBeTruthy())
        const call = fetchMock.mock.calls.find(([input]) => String(input).includes("/entry-code"))
        expect(JSON.parse(String(call![1]?.body))).toEqual({ code: "ABC234" })
    })

    it("keeps the server's refusal on the form", async () => {
        draw({ [ENTRY]: { body: { message: "Mã không hợp lệ hoặc đã hết hạn." }, status: 404 } }, "/login")

        await userEvent.click(screen.getByRole("button", { name: /Quên mật khẩu/ }))
        await userEvent.type(screen.getByLabelText("Mã một lần"), "HET234")
        await userEvent.click(screen.getByRole("button", { name: "Vào" }))

        expect(await screen.findByRole("alert")).toHaveTextContent(/không hợp lệ hoặc đã hết hạn/)
        expect(screen.getByLabelText("Mã một lần")).toBeTruthy()
    })

    it("walks back to the password door", async () => {
        draw({}, "/login")

        await userEvent.click(screen.getByRole("button", { name: /Quên mật khẩu/ }))
        await userEvent.click(screen.getByRole("button", { name: /Quay lại đăng nhập/ }))

        expect(screen.getByLabelText("Email")).toBeTruthy()
        expect(screen.queryByLabelText("Mã một lần")).toBeNull()
    })
})
