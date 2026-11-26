import { act, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { StreamStatus } from "@shared/lib/ws"
import { AuditPage } from "@/pages/AuditPage"
import { renderWithProviders } from "./helpers/render"

const stream = vi.hoisted(() => ({
    status: "live" as StreamStatus,
    onMessage: null as ((message: unknown) => void) | null,
}))

vi.mock("@shared/lib/ws", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@shared/lib/ws")>()
    return {
        ...actual,
        useSocketStream: (
            _path: string,
            _enabled: boolean,
            onMessage: (message: unknown) => void
        ) => {
            stream.onMessage = onMessage
            return { status: stream.status, generation: 0, reconnect: () => {} }
        },
    }
})

afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
})

const details = { keyId: "k1", username: "op1" }

const event = {
    id: "e1",
    action: "mcp_key_issued",
    actorId: "a1",
    actorName: "Operator One",
    targetId: "t1",
    targetName: "CI bot",
    matchId: "7f1d4f1e-0000-4000-8000-000000000001",
    details,
    ip: "127.0.0.1",
    userAgent: "Mozilla/5.0",
    createdAt: "2026-11-26T12:00:00Z",
}

const actions = { actions: ["account_disabled", "mcp_key_issued"] }

const page = (items: unknown[]) => ({ items, total: items.length, limit: 50, offset: 0 })

const baseRoutes = {
    "GET /portal/audit-events?limit=50&offset=0": { body: page([event]) },
    "GET /portal/audit-events/actions": { body: actions },
}

describe("AuditPage", () => {
    it("shows the skeleton before the first page resolves, then the list", async () => {
        renderWithProviders(<AuditPage />, { routes: baseRoutes })

        expect(screen.queryByRole("table")).toBeNull()
        const table = await screen.findByRole("table")
        expect(within(table).getByText("mcp_key_issued")).toBeInTheDocument()
        expect(within(table).getByText("Operator One")).toBeInTheDocument()
        expect(within(table).getByText("CI bot")).toBeInTheDocument()
        expect(within(table).getByText("7f1d4f1e")).toBeInTheDocument()
        expect(within(table).getByText("127.0.0.1")).toBeInTheDocument()
    })

    it("shows the shared error panel when the list request fails", async () => {
        renderWithProviders(<AuditPage />, {
            routes: {
                "GET /portal/audit-events?limit=50&offset=0": {
                    status: 500,
                    body: { message: "audit unavailable" },
                },
                "GET /portal/audit-events/actions": { body: actions },
            },
        })

        expect(await screen.findByRole("alert")).toHaveTextContent("audit unavailable")
    })

    it("shows the empty state when nothing matches", async () => {
        renderWithProviders(<AuditPage />, {
            routes: {
                "GET /portal/audit-events?limit=50&offset=0": { body: page([]) },
                "GET /portal/audit-events/actions": { body: actions },
            },
        })

        expect(await screen.findByText("No audit events yet")).toBeInTheDocument()
    })

    it("refetches with the trimmed search after the debounce", async () => {
        const user = userEvent.setup()
        const { fetchMock } = renderWithProviders(<AuditPage />, {
            routes: {
                ...baseRoutes,
                "GET /portal/audit-events?q=key&limit=50&offset=0": { body: page([event]) },
            },
        })

        await screen.findByRole("table")
        await user.type(screen.getByLabelText("Search audit events"), "key")

        if (!fetchMock) throw new Error("fetch was not stubbed")
        await waitFor(() =>
            expect(
                fetchMock.mock.calls.some(([url]) => url === "/portal/audit-events?q=key&limit=50&offset=0")
            ).toBe(true)
        )
    })

    it("populates the action dropdown from the actions endpoint", async () => {
        renderWithProviders(<AuditPage />, { routes: baseRoutes })

        const select = screen.getByLabelText("Action")
        expect(await within(select).findByRole("option", { name: "account_disabled" })).toBeInTheDocument()
        expect(within(select).getByRole("option", { name: "mcp_key_issued" })).toBeInTheDocument()
        expect(within(select).getByRole("option", { name: "All actions" })).toBeInTheDocument()
    })

    it("expands a row into its formatted details JSON", async () => {
        const user = userEvent.setup()
        renderWithProviders(<AuditPage />, { routes: baseRoutes })

        const expand = await screen.findByRole("button", { name: "Expand event" })
        expect(expand).toHaveAttribute("aria-expanded", "false")
        await user.click(expand)

        expect(expand).toHaveAttribute("aria-expanded", "true")
        expect(screen.getByText("Mozilla/5.0")).toBeInTheDocument()
        expect(screen.getByText("a1")).toBeInTheDocument()
        const pre = document.querySelector("pre")
        if (!pre) throw new Error("details JSON was not rendered")
        expect(pre.textContent).toBe(JSON.stringify(details, null, 2))
    })

    it("copies the details JSON and reports Copied", async () => {
        const user = userEvent.setup()
        const writeText = vi.fn(async () => {})
        Object.defineProperty(navigator, "clipboard", {
            value: { writeText },
            configurable: true,
        })
        renderWithProviders(<AuditPage />, { routes: baseRoutes })

        await user.click(await screen.findByRole("button", { name: "Expand event" }))
        await user.click(screen.getByRole("button", { name: /Copy JSON/ }))

        expect(writeText).toHaveBeenCalledWith(JSON.stringify(details, null, 2))
        expect(screen.getByRole("button", { name: /Copied/ })).toBeInTheDocument()
    })

    it("prepends an audit_event frame on page 1 with no filters", async () => {
        renderWithProviders(<AuditPage />, { routes: baseRoutes })

        await screen.findByRole("table")
        const pushed = { ...event, id: "e2", action: "account_disabled", createdAt: "2026-11-26T12:05:00Z" }
        act(() =>
            stream.onMessage?.({
                v: 1,
                type: "audit_event",
                at: "2026-11-26T12:05:00Z",
                data: { event: pushed },
            })
        )

        await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(3))
        const rows = screen.getAllByRole("row")
        expect(within(rows[1]).getByText("account_disabled")).toBeInTheDocument()
        expect(within(rows[2]).getByText("mcp_key_issued")).toBeInTheDocument()
    })

    it("ignores a pushed frame while a filter is active", async () => {
        const user = userEvent.setup()
        renderWithProviders(<AuditPage />, {
            routes: {
                ...baseRoutes,
                "GET /portal/audit-events?q=key&limit=50&offset=0": { body: page([event]) },
            },
        })

        await user.type(screen.getByLabelText("Search audit events"), "key")
        await waitFor(() =>
            expect(screen.getByRole("table")).toBeInTheDocument()
        )
        const pushed = { ...event, id: "e2", action: "account_disabled" }
        act(() =>
            stream.onMessage?.({
                v: 1,
                type: "audit_event",
                at: "2026-11-26T12:05:00Z",
                data: { event: pushed },
            })
        )

        const table = screen.getByRole("table")
        expect(within(table).queryByText("account_disabled")).toBeNull()
        expect(within(table).getByText("mcp_key_issued")).toBeInTheDocument()
    })

    it("points the export link at the current filters", async () => {
        const user = userEvent.setup()
        renderWithProviders(<AuditPage />, {
            routes: {
                ...baseRoutes,
                "GET /portal/audit-events?q=key&limit=50&offset=0": { body: page([event]) },
            },
        })

        const link = await screen.findByRole("link", { name: /Export CSV/ })
        expect(link).toHaveAttribute("href", "/portal/audit-events/export")
        expect(link).toHaveAttribute("download")

        await user.type(screen.getByLabelText("Search audit events"), "key")
        await waitFor(() =>
            expect(link).toHaveAttribute("href", "/portal/audit-events/export?q=key")
        )
    })
})
