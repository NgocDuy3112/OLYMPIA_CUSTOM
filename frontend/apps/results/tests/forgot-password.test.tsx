import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom"
import { describe, expect, it, vi } from "vitest"
import { ForgotPasswordPage } from "@/pages/ForgotPasswordPage"
import { LoginPage } from "@/pages/LoginPage"

function WhereAmI() {
    const location = useLocation()
    return <p>landed at {location.pathname}</p>
}

interface StubRoute { body: unknown; status?: number }

function draw(routes: Record<string, StubRoute>, entry = "/forgot-password") {
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
                    <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                    <Route path="*" element={<WhereAmI />} />
                </Routes>
            </MemoryRouter>
        </QueryClientProvider>
    )
    return { ...result, fetchMock: mock }
}

const METHODS = "GET /api/auth/methods"
const FORGOT = "POST /api/auth/forgot-password"
const RESET = "POST /api/auth/reset-password"

const GOOGLE = { [METHODS]: { body: { google: true, password: true } } }

type FetchMock = ReturnType<typeof draw>["fetchMock"]

function sentBodies(fetchMock: FetchMock, routeKey: string): unknown[] {
    const path = routeKey.split(" ")[1]
    return fetchMock.mock.calls
        .map((call) => ({ input: call[0], init: call[1] as RequestInit | undefined }))
        .filter(({ input, init }) => {
            if (String(input) !== path) return false
            if (!init) return false
            return init.method === "POST"
        })
        .map(({ init }) => JSON.parse(String(init?.body ?? "{}")))
}

async function reachCodeStep(routes: Record<string, StubRoute>) {
    const { fetchMock } = draw(routes)
    await userEvent.type(screen.getByLabelText("Email"), "an@example.com")
    await userEvent.click(screen.getByRole("button", { name: "Gửi mã" }))
    await screen.findByText(/Mã đã gửi tới an@example.com/)
    return { fetchMock }
}

describe("ForgotPasswordPage", () => {
    it("links back to login on every step", async () => {
        draw({ [FORGOT]: { body: { ok: true } } })
        expect(screen.getByRole("link", { name: "Quay lại đăng nhập" })).toHaveAttribute("href", "/login")

        await userEvent.type(screen.getByLabelText("Email"), "an@example.com")
        await userEvent.click(screen.getByRole("button", { name: "Gửi mã" }))
        expect(await screen.findByRole("link", { name: "Quay lại đăng nhập" })).toHaveAttribute("href", "/login")
    })

    it("sends the email and moves to the code step", async () => {
        const { fetchMock } = draw({ [FORGOT]: { body: { ok: true } } })

        await userEvent.type(screen.getByLabelText("Email"), "an@example.com")
        await userEvent.click(screen.getByRole("button", { name: "Gửi mã" }))

        await screen.findByText(/Mã đã gửi tới an@example.com/)
        expect(sentBodies(fetchMock, FORGOT)).toEqual([{ email: "an@example.com" }])
    })

    it("resets the password and lands on login", async () => {
        const { fetchMock } = await reachCodeStep({
            [FORGOT]: { body: { ok: true } },
            [RESET]: { body: { ok: true } },
        })

        await userEvent.type(await screen.findByRole("textbox"), "482913")
        await userEvent.type(screen.getByLabelText("Mật khẩu mới"), "mat-khau-moi-123")
        await userEvent.type(screen.getByLabelText("Nhập lại mật khẩu mới"), "mat-khau-moi-123")
        await userEvent.click(screen.getByRole("button", { name: "Đặt mật khẩu mới" }))

        await waitFor(() =>
            expect(screen.getByText("Cổng vào trận của thí sinh — dùng email và mật khẩu của bạn.")).toBeTruthy()
        )
        expect(sentBodies(fetchMock, RESET)).toEqual([
            { email: "an@example.com", code: "482913", newPassword: "mat-khau-moi-123" },
        ])
    })

    it("refuses a repeat that does not match, without sending anything", async () => {
        const { fetchMock } = await reachCodeStep({ [FORGOT]: { body: { ok: true } } })

        await userEvent.type(await screen.findByRole("textbox"), "482913")
        await userEvent.type(screen.getByLabelText("Mật khẩu mới"), "mat-khau-moi-123")
        await userEvent.type(screen.getByLabelText("Nhập lại mật khẩu mới"), "khac-nhau-het")
        await userEvent.click(screen.getByRole("button", { name: "Đặt mật khẩu mới" }))

        expect(await screen.findByRole("alert")).toHaveTextContent(/chưa giống nhau/)
        expect(sentBodies(fetchMock, RESET)).toEqual([])
    })

    it("refuses a short password, without sending anything", async () => {
        const { fetchMock } = await reachCodeStep({ [FORGOT]: { body: { ok: true } } })

        await userEvent.type(await screen.findByRole("textbox"), "482913")
        await userEvent.type(screen.getByLabelText("Mật khẩu mới"), "ngan")
        await userEvent.type(screen.getByLabelText("Nhập lại mật khẩu mới"), "ngan")
        await userEvent.click(screen.getByRole("button", { name: "Đặt mật khẩu mới" }))

        expect(await screen.findByRole("alert")).toHaveTextContent(/ít nhất 8 ký tự/)
        expect(sentBodies(fetchMock, RESET)).toEqual([])
    })

    it("keeps the server's refusal on the form", async () => {
        await reachCodeStep({
            [FORGOT]: { body: { ok: true } },
            [RESET]: { body: { message: "Mã đã hết hạn, gửi lại mã mới nhé." }, status: 400 },
        })

        await userEvent.type(await screen.findByRole("textbox"), "000000")
        await userEvent.type(screen.getByLabelText("Mật khẩu mới"), "mat-khau-moi-123")
        await userEvent.type(screen.getByLabelText("Nhập lại mật khẩu mới"), "mat-khau-moi-123")
        await userEvent.click(screen.getByRole("button", { name: "Đặt mật khẩu mới" }))

        expect(await screen.findByRole("alert")).toHaveTextContent(/Mã đã hết hạn/)
    })
})

describe("LoginPage forgot-password link", () => {
    it("shows Quên mật khẩu in login mode and opens the forgot route", async () => {
        draw({ ...GOOGLE }, "/login")

        await screen.findByRole("link", { name: "Đăng nhập bằng Google" })
        await userEvent.click(screen.getByRole("link", { name: "Quên mật khẩu?" }))

        expect(await screen.findByRole("heading", { name: "Quên mật khẩu" })).toBeTruthy()
    })

    it("hides Quên mật khẩu in register mode", async () => {
        draw({ ...GOOGLE }, "/login")

        await screen.findByRole("link", { name: "Đăng nhập bằng Google" })
        await userEvent.click(screen.getByRole("button", { name: "Đăng ký" }))

        expect(screen.queryByRole("link", { name: "Quên mật khẩu?" })).toBeNull()
    })
})
