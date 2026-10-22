import { afterEach, describe, expect, it, vi } from "vitest"
import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, Route, Routes } from "react-router-dom"

import { SeasonsPage } from "@/pages/SeasonsPage"
import { renderWithProviders, stubFetch } from "../helpers/render"

const SEASON = {
    id: "s1", name: "2026 Season", slug: "2026-season", visibility: "PUBLIC",
    ownerId: "u1", tags: ["THTH"], current: true,
    stages: [], rounds: [{ id: "r1", name: "Round One", order: 0, chart: "bars" }],
    format: { competitorsPerMatch: 4 }, placementTiers: [], closedAt: null,
    createdAt: "2026-01-02T00:00:00.000Z", updatedAt: "2026-01-02T00:00:00.000Z",
}

const page = (items: unknown[]) => ({ items, total: items.length, limit: 100, offset: 0 })

function renderSeasons() {
    return renderWithProviders(
        <MemoryRouter initialEntries={["/"]}>
            <Routes>
                <Route path="/" element={<SeasonsPage />} />
            </Routes>
        </MemoryRouter>,
    )
}

afterEach(() => {
    vi.unstubAllGlobals()
})

describe("SeasonsPage", () => {
    it("lists the seasons", async () => {
        stubFetch({
            "GET /portal/seasons?limit=20&offset=0": { body: page([SEASON]) },
        })
        renderSeasons()

        expect(await screen.findByText("2026 Season")).toBeInTheDocument()
        expect(screen.getByText("Current")).toBeInTheDocument()
        expect(screen.getByText("THTH")).toBeInTheDocument()
    })

    it("creates a season with its name, tags and visibility", async () => {
        const user = userEvent.setup()
        const fetchMock = stubFetch({
            "GET /portal/seasons?limit=20&offset=0": { body: page([]) },
            "POST /portal/seasons": { body: SEASON },
        })
        renderSeasons()

        await user.click(screen.getByRole("button", { name: "New season" }))
        await user.type(await screen.findByLabelText("Name"), "2027 Season")
        await user.type(screen.getByLabelText("Tags"), "THTH, GDTT")
        await user.click(screen.getByRole("button", { name: "Create season" }))

        const post = fetchMock.mock.calls.find(
            ([url, init]) => url === "/portal/seasons" && init?.method === "POST"
        )
        if (!post) throw new Error("no POST to /portal/seasons")

        expect(JSON.parse(post[1]?.body as string)).toEqual({
            name: "2027 Season",
            tags: ["THTH", "GDTT"],
            visibility: "PUBLIC",
        })
    })

    it("shows an empty state", async () => {
        stubFetch({
            "GET /portal/seasons?limit=20&offset=0": { body: page([]) },
        })
        renderSeasons()

        expect(await screen.findByText("No seasons yet")).toBeInTheDocument()
    })
})
