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

const ME = "GET /api/auth/me"
const METHODS = "GET /api/auth/methods"
const CHANGE = "POST /api/auth/change-password"

const signedIn = { [ME]: { body: { id: "u1", displayName: "Ngọc Duy", username: "ngoc-duy", role: "PLAYER" } } }
const signedOut = { [ME]: { status: 401, body: { message: "no session" } } }

describe("LoginPage", () => {
    const GOOGLE = { [METHODS]: { body: { google: true, password: true } } }
    const googleDoor = () => screen.findByRole("link", { name: "Đăng nhập bằng Google" })

    it("offers Google next to the email/password form", async () => {
        draw(GOOGLE)

        await googleDoor()
        expect(screen.queryByLabelText("Tên đăng nhập")).toBeNull()
        expect(screen.getByLabelText("Email")).toBeTruthy()
        expect(screen.getByLabelText("Mật khẩu")).toBeTruthy()
    })

    it("registers with email + password and lands on next", async () => {
        const routes = {
            ...GOOGLE,
            "POST /api/auth/register": { body: { ok: true, displayName: "An" } },
        }
        draw(routes, "/login?next=%2Fcode")

        await googleDoor()
        await userEvent.click(screen.getByRole("button", { name: "Đăng ký" }))
        await userEvent.type(screen.getByLabelText("Email"), "an@example.com")
        await userEvent.type(screen.getByLabelText("Mật khẩu"), "mat-khau-2026")
        await userEvent.click(screen.getByRole("button", { name: "Tạo tài khoản" }))

        await waitFor(() => expect(screen.getByText("landed at /code")).toBeTruthy())
    })

    it("logs in with email + password and lands on next", async () => {
        const routes = {
            ...GOOGLE,
            "POST /api/auth/login": { body: { ok: true, displayName: "An" } },
        }
        draw(routes, "/login?next=%2Fcode")

        await googleDoor()
        await userEvent.type(screen.getByLabelText("Email"), "an@example.com")
        await userEvent.type(screen.getByLabelText("Mật khẩu"), "mat-khau-2026")
        await userEvent.click(screen.getByRole("button", { name: "Vào trận" }))

        await waitFor(() => expect(screen.getByText("landed at /code")).toBeTruthy())
    })

    it("keeps the server's refusal on the form", async () => {
        const routes = {
            ...GOOGLE,
            "POST /api/auth/login": { body: { message: "Email hoặc mật khẩu không đúng." }, status: 401 },
        }
        draw(routes)

        await googleDoor()
        await userEvent.type(screen.getByLabelText("Email"), "an@example.com")
        await userEvent.type(screen.getByLabelText("Mật khẩu"), "sai-mat-khau")
        await userEvent.click(screen.getByRole("button", { name: "Vào trận" }))

        expect(await screen.findByRole("alert")).toHaveTextContent(/không đúng/)
    })

    it("carries ?next= into the Google redirect", async () => {
        draw(GOOGLE, "/login?next=%2Fcode")
        const href = (await googleDoor()).getAttribute("href") ?? ""
        expect(href).toContain("/auth/google")
        expect(decodeURIComponent(href.split("next=")[1])).toBe("/code")
    })

    it("refuses a //host next= — it can only send a player inside this app", async () => {
        draw(GOOGLE, "/login?next=%2F%2Fevil.example")
        const href = (await googleDoor()).getAttribute("href") ?? ""
        expect(decodeURIComponent(href.split("next=")[1])).toBe("/")
    })

    it("still offers the email form when Google is off", async () => {
        draw({}, "/login?notice=google-off")
        expect(await screen.findByLabelText("Email")).toBeTruthy()
        expect(screen.queryByRole("link", { name: "Đăng nhập bằng Google" })).toBeNull()
        expect(screen.queryByText(/chưa được cấu hình/)).toBeNull()
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
        vi.stubEnv("VITE_GAMEPLAY_BASE_URL", "/app")
        draw({ ...signedIn, [CHANGE]: { body: { ok: true, displayName: "Ngọc Duy" } } },
            "/password?next=%2Ftournaments%2Ft-cup%2Fmatches%2Fm1")

        await userEvent.type(screen.getByLabelText("Mật khẩu ban điều hành cấp"), "mat-khau-ban-2026")
        await userEvent.type(screen.getByLabelText("Mật khẩu mới"), "mat-khau-moi-123")
        await userEvent.type(screen.getByLabelText("Nhập lại mật khẩu mới"), "mat-khau-moi-123")
        await userEvent.click(screen.getByRole("button", { name: "Đặt mật khẩu" }))

        await waitFor(() => expect(screen.getByText("landed at /app/tournaments/t-cup/matches/m1")).toBeTruthy())
        vi.unstubAllEnvs()
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
        expect(screen.queryByLabelText("Mật khẩu mới")).toBeNull()
    })
})
