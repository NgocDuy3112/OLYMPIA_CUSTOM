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

describe("revoking an MCP key", () => {
    it("posts the key to the batch revoke endpoint once", async () => {
        const user = userEvent.setup()
        const { fetchMock } = renderWithProviders(<McpKeysPage />, {
            routes: {
                "GET /portal/mcp-keys?limit=50&offset=0": {
                    body: { items: [key], total: 1, limit: 50, offset: 0 },
                },
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
