import { afterEach, describe, expect, it, vi } from "vitest"
import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, Route, Routes } from "react-router-dom"

import { SeasonsPage } from "@/pages/SeasonsPage"
import { renderWithProviders, stubFetch } from "../helpers/render"

const TOURNAMENT = {
    id: "t1", name: "Autumn Open", slug: "autumn-open", visibility: "PUBLIC",
    ownerId: "u1", defaultTags: ["THTH"], defaultRounds: [], defaultFormat: {},
    defaultPlacementTiers: [], createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
}

const SEASON = {
    id: "s1", tournamentId: "t1", name: "2026 Season", current: true,
    stages: [], rounds: [{ id: "r1", name: "Round One", order: 0, chart: "bars" }],
    format: {}, placementTiers: [], closedAt: null,
    createdAt: "2026-01-02T00:00:00.000Z", updatedAt: "2026-01-02T00:00:00.000Z",
}

const page = (items: unknown[]) => ({ items, total: items.length, limit: 100, offset: 0 })

function renderSeasons() {
    return renderWithProviders(
        <MemoryRouter initialEntries={["/tournaments/t1/seasons"]}>
            <Routes>
                <Route path="/tournaments/:tournamentId/seasons" element={<SeasonsPage />} />
            </Routes>
        </MemoryRouter>,
    )
}

afterEach(() => {
    vi.unstubAllGlobals()
})

describe("SeasonsPage", () => {
    it("lists a tournament's seasons", async () => {
        stubFetch({
            "GET /portal/tournaments/t1": { body: TOURNAMENT },
            "GET /portal/tournaments/t1/seasons?limit=100": { body: page([SEASON]) },
        })
        renderSeasons()

        expect(await screen.findByText("2026 Season")).toBeInTheDocument()
        expect(screen.getByText("Current")).toBeInTheDocument()
    })

    it("creates a season with converted stage timestamps", async () => {
        const user = userEvent.setup()
        const fetchMock = stubFetch({
            "GET /portal/tournaments/t1": { body: TOURNAMENT },
            "GET /portal/tournaments/t1/seasons?limit=100": { body: page([]) },
            "POST /portal/tournaments/t1/seasons": { body: SEASON },
        })
        renderSeasons()

        await user.type(await screen.findByLabelText("Name"), "2027 Season")
        await user.click(screen.getByRole("button", { name: "Add stage" }))
        await user.type(screen.getByLabelText("Stage 1 title"), "Group stage")
        await user.type(screen.getByLabelText("Stage 1 start"), "2027-02-01T09:00")
        await user.type(screen.getByLabelText("Stage 1 end"), "2027-02-28T18:00")
        await user.click(screen.getByRole("button", { name: "Create season" }))

        const post = fetchMock.mock.calls.find(
            ([url, init]) =>
                url === "/portal/tournaments/t1/seasons" && init?.method === "POST"
        )
        if (!post) throw new Error("no POST to /portal/tournaments/t1/seasons")

        expect(JSON.parse(post[1]?.body as string)).toEqual({
            name: "2027 Season",
            current: false,
            stages: [
                {
                    id: expect.any(String),
                    title: "Group stage",
                    start: new Date("2027-02-01T09:00").toISOString(),
                    end: new Date("2027-02-28T18:00").toISOString(),
                },
            ],
        })
    })

    it("shows an empty state", async () => {
        stubFetch({
            "GET /portal/tournaments/t1": { body: TOURNAMENT },
            "GET /portal/tournaments/t1/seasons?limit=100": { body: page([]) },
        })
        renderSeasons()

        expect(await screen.findByText("No seasons yet.")).toBeInTheDocument()
    })
})