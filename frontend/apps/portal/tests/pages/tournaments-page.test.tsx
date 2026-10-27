import { afterEach, describe, expect, it, vi } from "vitest"
import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, Route, Routes } from "react-router-dom"

import { TournamentsPage } from "@/pages/TournamentsPage"
import { renderWithProviders, stubFetch } from "../helpers/render"

const SEASON = {
    id: "s1", name: "2026 Tournament", slug: "2026-tournament", visibility: "PUBLIC",
    ownerId: "u1", tags: ["THTH"], current: true,
    stages: [], rounds: [{ id: "r1", name: "Round One", order: 0, chart: "bars" }],
    format: { competitorsPerMatch: 4 }, placementTiers: [], closedAt: null,
    createdAt: "2026-01-02T00:00:00.000Z", updatedAt: "2026-01-02T00:00:00.000Z",
}

const page = (items: unknown[]) => ({ items, total: items.length, limit: 100, offset: 0 })

function renderTournaments() {
    return renderWithProviders(
        <MemoryRouter initialEntries={["/"]}>
            <Routes>
                <Route path="/" element={<TournamentsPage />} />
            </Routes>
        </MemoryRouter>,
    )
}

afterEach(() => {
    vi.unstubAllGlobals()
})

describe("TournamentsPage", () => {
    it("lists the tournaments", async () => {
        stubFetch({
            "GET /portal/tournaments?limit=20&offset=0": { body: page([SEASON]) },
        })
        renderTournaments()

        expect(await screen.findByText("2026 Tournament")).toBeInTheDocument()
        expect(screen.getByText("Current")).toBeInTheDocument()
    })

    it("creates a tournament with its name and visibility", async () => {
        const user = userEvent.setup()
        const fetchMock = stubFetch({
            "GET /portal/tournaments?limit=20&offset=0": { body: page([]) },
            "POST /portal/tournaments": { body: SEASON },
        })
        renderTournaments()

        await user.click(screen.getByRole("button", { name: "New tournament" }))
        await user.type(await screen.findByLabelText("Name"), "2027 Tournament")
        await user.click(screen.getByRole("button", { name: "Create tournament" }))

        const post = fetchMock.mock.calls.find(
            ([url, init]) => url === "/portal/tournaments" && init?.method === "POST"
        )
        if (!post) throw new Error("no POST to /portal/tournaments")

        // no tags field in the UI: the server defaults the assembly scope
        expect(JSON.parse(post[1]?.body as string)).toEqual({
            name: "2027 Tournament",
            visibility: "PUBLIC",
        })
    })

    it("shows an empty state", async () => {
        stubFetch({
            "GET /portal/tournaments?limit=20&offset=0": { body: page([]) },
        })
        renderTournaments()

        expect(await screen.findByText("No tournaments yet")).toBeInTheDocument()
    })
})
