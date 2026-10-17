import { afterEach, describe, expect, it, vi } from "vitest"
import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, Route, Routes } from "react-router-dom"

import { TournamentDetailPage } from "@/pages/TournamentDetailPage"
import { renderWithProviders, stubFetch } from "../helpers/render"

const SESSION = {
    id: "u1", username: "ADMIN", displayName: "ADMIN", role: "ADMIN",
    emailVerified: false, totpEnabled: true, avatarUrl: null,
}

const DETAIL = {
    id: "t1",
    name: "Autumn Open",
    slug: "autumn-open",
    visibility: "PUBLIC",
    ownerId: "u1",
    defaultTags: ["THTH", "GDTT"],
    defaultRounds: [{ id: "r1", name: "Round One", order: 0, chart: "bars" }],
    defaultFormat: {
        competitorsPerMatch: 4,
        allowedSeatKinds: ["user"],
        teamSize: null,
        teamAggregation: null,
        teamCountAggregation: null,
    },
    defaultPlacementTiers: [{ min: 1, max: 4, points: 10 }],
    createdAt: "2026-01-15T00:00:00.000Z",
    updatedAt: "2026-01-16T00:00:00.000Z",
}

function renderDetail() {
    return renderWithProviders(
        <MemoryRouter initialEntries={["/tournaments/t1"]}>
            <Routes>
                <Route path="/tournaments/:id" element={<TournamentDetailPage />} />
            </Routes>
        </MemoryRouter>,
    )
}

afterEach(() => {
    vi.unstubAllGlobals()
})

describe("TournamentDetailPage", () => {
    it("renders the tournament and its configuration", async () => {
        stubFetch({
            "GET /portal/auth/me": { body: SESSION },
            "GET /portal/tournaments/t1": { body: DETAIL },
        })
        renderDetail()

        expect(await screen.findByText("Autumn Open")).toBeInTheDocument()
        expect(screen.getByText("Round One")).toBeInTheDocument()
        expect(screen.getByText("1–4")).toBeInTheDocument()
    })

    it("saves edited scalar fields with PATCH", async () => {
        const user = userEvent.setup()
        const fetchMock = stubFetch({
            "GET /portal/auth/me": { body: SESSION },
            "GET /portal/tournaments/t1": { body: DETAIL },
            "PATCH /portal/tournaments/t1": { body: { ...DETAIL, name: "Autumn Open (Final)" } },
        })
        renderDetail()

        const name = await screen.findByLabelText("Name")
        await user.clear(name)
        await user.type(name, "Autumn Open (Final)")
        await user.click(screen.getByRole("button", { name: "Save changes" }))

        expect(await screen.findByText("Saved.")).toBeInTheDocument()
        expect(fetchMock).toHaveBeenCalledWith(
            "/portal/tournaments/t1",
            expect.objectContaining({
                method: "PATCH",
                body: JSON.stringify({
                    name: "Autumn Open (Final)",
                    slug: "autumn-open",
                    visibility: "PUBLIC",
                    defaultTags: ["THTH", "GDTT"],
                }),
            }),
        )
    })

    it("surfaces a slug conflict from the server", async () => {
        const user = userEvent.setup()
        stubFetch({
            "GET /portal/auth/me": { body: SESSION },
            "GET /portal/tournaments/t1": { body: DETAIL },
            "PATCH /portal/tournaments/t1": {
                body: { message: 'slug "taken" is already taken' },
                status: 409,
            },
        })
        renderDetail()

        await user.click(await screen.findByRole("button", { name: "Save changes" }))

        expect(await screen.findByRole("alert")).toHaveTextContent(/already taken/i)
    })
})