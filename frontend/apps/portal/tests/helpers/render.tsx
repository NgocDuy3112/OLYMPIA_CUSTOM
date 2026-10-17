import type { ReactElement } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render } from "@testing-library/react"
import { vi } from "vitest"

export interface StubRoute {
    body: unknown
    status?: number
}


function jsonResponse({ body, status = 200 }: StubRoute): Response {
    return {
        ok: status >= 200 && status < 300,
        status,
        statusText: "",
        json: async () => body,
    } as unknown as Response
}


export function stubFetch(routes: Record<string, StubRoute>) {
    const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const key = `${init?.method ?? "GET"} ${String(input)}`
        const route = routes[key]
        if (!route) throw new Error(`unexpected request: ${key}`)
        return jsonResponse(route)
    })

    vi.stubGlobal("fetch", mock)
    return mock
}

export function renderWithProviders(ui: ReactElement) {
    const client = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
        },
    })

    return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}