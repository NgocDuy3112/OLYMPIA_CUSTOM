import { afterEach, describe, expect, it, vi } from "vitest"
import { screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"

import { TournamentsPage } from "@/pages/TournamentsPage"
import { renderWithProviders, stubFetch } from "../helpers/render"
import userEvent from "@testing-library/user-event"


function renderPage() {
    return renderWithProviders(
        <MemoryRouter>
            <TournamentsPage />
        </MemoryRouter>,
    )
}


const page = (items: unknown[], total = items.length) => ({
    items,
    total,
    limit: 20,
    offset: 0,
})

const TOURNAMENT = {
    id: "t1",
    name: "Autumn Open",
    slug: "autumn-open",
    visibility: "PUBLIC",
    defaultTags: ["THTH", "GDTT"],
    createdAt: "2026-01-15T00:00:00.000Z",
    updatedAt: "2026-01-15T00:00:00.000Z",
}

afterEach(() => {
    vi.unstubAllGlobals()
})

describe("TournamentsPage", () => {
    it("lists tournaments from the API", async () => {
        stubFetch({ "GET /portal/tournaments?limit=20&offset=0": { body: page([TOURNAMENT]) } })
        renderPage()

        expect(await screen.findByText("Autumn Open")).toBeInTheDocument()
        expect(screen.getByText("autumn-open")).toBeInTheDocument()
        expect(screen.getByText("1 total")).toBeInTheDocument()
    })

    it("shows an empty state rather than an empty table", async () => {
        stubFetch({ "GET /portal/tournaments?limit=20&offset=0": { body: page([]) } })
        renderPage()

        expect(await screen.findByText(/no tournaments match/i)).toBeInTheDocument()
    })

    it("requests the next page with the right offset", async () => {
        const user = userEvent.setup()
        const fetchMock = stubFetch({
            "GET /portal/tournaments?limit=20&offset=0": { body: page([TOURNAMENT], 25) },
            "GET /portal/tournaments?limit=20&offset=20": { body: page([TOURNAMENT], 25) },
        })

        renderPage()

        expect(await screen.findByText("1–20 of 25")).toBeInTheDocument()

        await user.click(screen.getByRole("button", { name: "Next" }))

        expect(await screen.findByText("21–25 of 25")).toBeInTheDocument()
        expect(fetchMock).toHaveBeenCalledWith(
            "/portal/tournaments?limit=20&offset=20",
            expect.anything()
        )
    })

    it("disables Previous on the first page and Next on the last", async () => {
        stubFetch({ "GET /portal/tournaments?limit=20&offset=0": { body: page([TOURNAMENT], 1) } })
        renderPage()

        expect(await screen.findByText("1–1 of 1")).toBeInTheDocument()
        expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled()
        expect(screen.getByRole("button", { name: "Next" })).toBeDisabled()
    })
})