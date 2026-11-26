import { afterEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { McpKeysPage } from "@/pages/McpKeysPage"
import { renderWithProviders } from "../helpers/render"

afterEach(() => {
    vi.unstubAllGlobals()
})

const key = {
    id: "k1",
    label: "CI bot",
    prefix: "aoc_live",
    scopes: ["READ"],
    expiresAt: null,
    revokedAt: null,
    lastUsedAt: null,
    createdAt: "2026-11-01T00:00:00.000Z",
}

const catalogue = {
    scopes: [
        { id: "READ", title: "Read tournaments", tools: ["list_tournaments", "get_match"], default: true },
        { id: "WRITE", title: "Write results", tools: ["judge_match"], default: false },
        { id: "ANNOUNCE", title: "Announce", tools: ["announce"], default: false },
    ],
}

const listRoute = (items: unknown[]) => ({
    body: { items, total: items.length, limit: 50, offset: 0 },
})

describe("revoking an MCP key", () => {
    it("posts the key to the batch revoke endpoint once", async () => {
        const user = userEvent.setup()
        const { fetchMock } = renderWithProviders(<McpKeysPage />, {
            routes: {
                "GET /portal/mcp-keys?limit=50&offset=0": listRoute([key]),
                "GET /portal/mcp-keys/scopes": { body: catalogue },
                "POST /portal/mcp-keys/revoke": { body: { revoked: 1, ids: ["k1"] } },
            },
        })

        await user.click(await screen.findByRole("button", { name: /Revoke/ }))
        const dialog = await screen.findByRole("dialog")
        await user.click(within(dialog).getByRole("button", { name: "Revoke key" }))

        if (!fetchMock) throw new Error("fetch was not stubbed")
        await waitFor(() =>
            expect(fetchMock.mock.calls.some(([url]) => url === "/portal/mcp-keys/revoke")).toBe(true)
        )
        const call = fetchMock.mock.calls.find(([url]) => url === "/portal/mcp-keys/revoke")!
        expect(call[1]?.method).toBe("POST")
        expect(JSON.parse(call[1]?.body as string)).toEqual({ ids: ["k1"] })
        expect(
            fetchMock.mock.calls.some(([url, init]) => url === "/portal/mcp-keys/k1" && init?.method === "DELETE")
        ).toBe(false)
    })
})

describe("scope catalogue", () => {
    it("requests the scope catalogue instead of hard-coding it", async () => {
        const { fetchMock } = renderWithProviders(<McpKeysPage />, {
            routes: {
                "GET /portal/mcp-keys?limit=50&offset=0": listRoute([]),
                "GET /portal/mcp-keys/scopes": { body: catalogue },
            },
        })

        await screen.findByText("No keys yet")
        if (!fetchMock) throw new Error("fetch was not stubbed")
        expect(fetchMock.mock.calls.some(([url]) => url === "/portal/mcp-keys/scopes")).toBe(true)
    })

    it("renders the create dialog checkboxes from the response, default-checked per the default flag", async () => {
        const user = userEvent.setup()
        renderWithProviders(<McpKeysPage />, {
            routes: {
                "GET /portal/mcp-keys?limit=50&offset=0": listRoute([]),
                "GET /portal/mcp-keys/scopes": { body: catalogue },
            },
        })

        await user.click(await screen.findByRole("button", { name: /New key/ }))
        const dialog = await screen.findByRole("dialog")

        expect(within(dialog).getByRole("checkbox", { name: /Read tournaments/ })).toBeChecked()
        expect(within(dialog).getByRole("checkbox", { name: /Write results/ })).not.toBeChecked()
        expect(within(dialog).getByRole("checkbox", { name: /Announce/ })).not.toBeChecked()
        expect(within(dialog).getByText("READ")).toBeTruthy()
        expect(within(dialog).getByText("WRITE")).toBeTruthy()
        expect(within(dialog).getByText("ANNOUNCE")).toBeTruthy()
    })

    it("posts the scopes the operator selected", async () => {
        const user = userEvent.setup()
        const { fetchMock } = renderWithProviders(<McpKeysPage />, {
            routes: {
                "GET /portal/mcp-keys?limit=50&offset=0": listRoute([]),
                "GET /portal/mcp-keys/scopes": { body: catalogue },
                "POST /portal/mcp-keys": { status: 201, body: { token: "aoc_live_secret" } },
            },
        })

        await user.click(await screen.findByRole("button", { name: /New key/ }))
        const dialog = await screen.findByRole("dialog")
        await user.type(within(dialog).getByLabelText("Label"), "Analyst bot")
        await user.click(within(dialog).getByRole("checkbox", { name: /Write results/ }))
        await user.click(within(dialog).getByRole("button", { name: "Issue key" }))

        if (!fetchMock) throw new Error("fetch was not stubbed")
        await waitFor(() =>
            expect(fetchMock.mock.calls.some(([url]) => url === "/portal/mcp-keys")).toBe(true)
        )
        const call = fetchMock.mock.calls.find(([url]) => url === "/portal/mcp-keys")!
        expect(JSON.parse(call[1]?.body as string)).toEqual({ label: "Analyst bot", scopes: ["READ", "WRITE"] })
    })

    it("shows the tools a key's scopes grant", async () => {
        renderWithProviders(<McpKeysPage />, {
            routes: {
                "GET /portal/mcp-keys?limit=50&offset=0": listRoute([key]),
                "GET /portal/mcp-keys/scopes": { body: catalogue },
            },
        })

        const row = (await screen.findByText("CI bot")).closest("tr")!
        expect(within(row).getByText("list_tournaments")).toBeTruthy()
        expect(within(row).getByText("get_match")).toBeTruthy()
        expect(within(row).queryByText("judge_match")).toBeNull()
        expect(within(row).queryByText("announce")).toBeNull()
    })

    it("shows the shared error panel when the catalogue request fails", async () => {
        renderWithProviders(<McpKeysPage />, {
            routes: {
                "GET /portal/mcp-keys?limit=50&offset=0": listRoute([]),
                "GET /portal/mcp-keys/scopes": { status: 500, body: { message: "boom" } },
            },
        })

        const alerts = await screen.findAllByRole("alert")
        expect(alerts.some((alert) => alert.textContent?.includes("boom"))).toBe(true)
        expect(screen.queryByRole("button", { name: /New key/ })).toBeDisabled()
    })
})
