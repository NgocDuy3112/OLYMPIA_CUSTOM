import { afterEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, Route, Routes } from "react-router-dom"

import { TournamentDetailPage } from "@/pages/TournamentDetailPage"
import { renderWithProviders } from "../helpers/render"

afterEach(() => {
    vi.unstubAllGlobals()
})

const TOURNAMENT = "t1"

const season = {
    id: TOURNAMENT,
    name: "2026 Tournament",
    slug: "2026-tournament",
    visibility: "PUBLIC",
    ownerId: "u1",
    current: false,
    stages: [],
    rounds: [],
    format: { competitorsPerMatch: 4 },
    closedAt: null,
    createdAt: "2026-01-02T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    roundRules: null,
    places: 0,
}

const me = (role: "ADMIN" | "OPERATOR") => ({
    body: {
        id: "u1",
        username: "ada",
        displayName: "Ada Lovelace",
        role,
        emailVerified: true,
        totpEnabled: true,
        avatarUrl: null,
    },
})

const draw = (role: "ADMIN" | "OPERATOR", routes: Record<string, { body: unknown; status?: number }> = {}) =>
    renderWithProviders(
        <MemoryRouter initialEntries={[`/tournaments/${TOURNAMENT}`]}>
            <Routes>
                <Route path="/tournaments/:tournamentId" element={<TournamentDetailPage />} />
                <Route path="/" element={<p>tournament list</p>} />
            </Routes>
        </MemoryRouter>,
        {
            routes: {
                "GET /portal/auth/me": me(role),
                [`GET /portal/tournaments/${TOURNAMENT}`]: { body: season },
                [`GET /portal/tournaments/${TOURNAMENT}/matches?limit=100`]: {
                    body: { items: [], total: 0, limit: 100, offset: 0 },
                },
                [`GET /portal/tournaments/${TOURNAMENT}/players`]: { body: { items: [] } },
                [`GET /portal/tournaments/${TOURNAMENT}/match-codes`]: { body: { items: [] } },
                ...routes,
            },
        }
    )

describe("deleting a tournament", () => {
    it("confirms, then DELETEs and returns to the list", async () => {
        const user = userEvent.setup()
        const { fetchMock } = draw("ADMIN", {
            [`DELETE /portal/tournaments/${TOURNAMENT}`]: { body: "", status: 204 },
        })

        await user.click(await screen.findByRole("button", { name: "Delete tournament" }))
        const dialog = await screen.findByRole("dialog")
        expect(within(dialog).getByText("2026 Tournament")).toBeInTheDocument()

        await user.click(within(dialog).getByRole("button", { name: "Delete" }))

        const call = fetchMock?.mock.calls.find(
            ([url, init]) => url === `/portal/tournaments/${TOURNAMENT}` && init?.method === "DELETE"
        )
        expect(call).toBeTruthy()
        expect(await screen.findByText("tournament list")).toBeInTheDocument()
    })

    it("disables the control for an operator and explains why", async () => {
        draw("OPERATOR")

        const button = await screen.findByRole("button", { name: "Delete tournament" })
        expect(button).toBeDisabled()
        expect(button).toHaveAttribute("title", "Only an admin can delete a tournament")
    })
})

describe("closing a tournament", () => {
    it("confirms, then POSTs the close and keeps the page open", async () => {
        const user = userEvent.setup()
        const { fetchMock } = draw("ADMIN", {
            [`POST /portal/tournaments/${TOURNAMENT}/close`]: { body: season },
        })

        await user.click(await screen.findByRole("button", { name: "Close tournament" }))
        const dialog = await screen.findByRole("dialog")
        await user.click(within(dialog).getByRole("button", { name: "Close tournament" }))

        if (!fetchMock) throw new Error("fetch was not stubbed")
        await waitFor(() =>
            expect(
                fetchMock.mock.calls.filter(
                    ([url, init]) =>
                        url === `/portal/tournaments/${TOURNAMENT}/close` && init?.method === "POST"
                )
            ).toHaveLength(1)
        )
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    })

    it("shows the server's reason when a LIVE match blocks the close", async () => {
        const user = userEvent.setup()
        draw("ADMIN", {
            [`POST /portal/tournaments/${TOURNAMENT}/close`]: {
                status: 409,
                body: { error: "CONFLICT", message: `tournament ${TOURNAMENT} still has a LIVE match` },
            },
        })

        await user.click(await screen.findByRole("button", { name: "Close tournament" }))
        const dialog = await screen.findByRole("dialog")
        await user.click(within(dialog).getByRole("button", { name: "Close tournament" }))

        expect(await within(dialog).findByRole("alert")).toHaveTextContent(
            `tournament ${TOURNAMENT} still has a LIVE match`
        )
    })

    it("disables close once the tournament is already closed", async () => {
        draw("ADMIN", {
            [`GET /portal/tournaments/${TOURNAMENT}`]: {
                body: { ...season, closedAt: "2026-11-20T00:00:00.000Z" },
            },
        })

        const button = await screen.findByRole("button", { name: "Close tournament" })
        expect(button).toBeDisabled()
        expect(button).toHaveAttribute("title", "Tournament already closed")
    })
})
