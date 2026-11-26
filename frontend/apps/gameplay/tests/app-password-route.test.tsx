import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import App from "@/App"

const ME = "GET /api/auth/me"

function stubFetch(routes: Record<string, { body: unknown; status?: number }>) {
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
    return mock
}

function renderAt(path: string) {
    window.history.replaceState(null, "", path)
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    return render(
        <QueryClientProvider client={client}>
            <App />
        </QueryClientProvider>
    )
}

const signedIn = {
    [ME]: { body: { id: "u1", displayName: "Ngọc Duy", username: "ngoc-duy", role: "PLAYER" } },
}

afterEach(() => {
    vi.unstubAllGlobals()
    window.history.replaceState(null, "", "/")
})

describe("gameplay /password route", () => {
    it("renders the shared password screen where the 409 gate sends a player", async () => {
        stubFetch(signedIn)
        renderAt("/password?next=%2Ftournaments%2Ft-cup%2Fmatches%2Fm1")

        expect(await screen.findByLabelText("Mật khẩu mới")).toBeTruthy()
        expect(screen.getByLabelText("Nhập lại mật khẩu mới")).toBeTruthy()
        expect(screen.queryByText("Không tìm thấy trang")).toBeNull()
    })
})
