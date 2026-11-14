import { afterEach, describe, expect, it, vi } from "vitest"
import { screen } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"

import { PlayersPage } from "@/pages/PlayersPage"
import { renderWithProviders, stubFetch } from "../helpers/render"

const PLAYERS_URL = "GET /portal/players"
const TOURNAMENTS_URL = "GET /portal/tournaments?limit=100&offset=0"

function renderPage() {
    return renderWithProviders(
        <MemoryRouter initialEntries={["/players"]}>
            <Routes>
                <Route path="/players" element={<PlayersPage />} />
            </Routes>
        </MemoryRouter>
    )
}

afterEach(() => {
    vi.unstubAllGlobals()
})

describe("the Thí sinh page", () => {
    it("renders the global desk under a plain header — no tournament picker left", async () => {
        stubFetch({
            [PLAYERS_URL]: {
                body: {
                    items: [
                        {
                            userId: "u1",
                            displayName: "Dị Ngọc",
                            username: "di-ngoc",
                            email: "ngoc@example.test",
                            discordId: null,
                            enrollments: [
                                { tournamentId: "t1", name: "AOC Test 2", current: true, closed: false },
                            ],
                        },
                    ],
                },
            },
            [TOURNAMENTS_URL]: {
                body: { items: [{ id: "t1", name: "AOC Test 2", current: true, closedAt: null }], total: 1, limit: 100, offset: 0 },
            },
        })
        renderPage()

        expect(await screen.findByText("Dị Ngọc")).toBeInTheDocument()
        expect(screen.getByRole("heading", { name: "Thí sinh" })).toBeInTheDocument()
        expect(screen.getByText("AOC Test 2 · current")).toBeInTheDocument()
        expect(screen.queryByLabelText("Chọn giải")).toBeNull()
    })

    it("shows the desk's own empty state when no account exists yet", async () => {
        stubFetch({
            [PLAYERS_URL]: { body: { items: [] } },
            [TOURNAMENTS_URL]: { body: { items: [], total: 0, limit: 100, offset: 0 } },
        })
        renderPage()

        expect(await screen.findByText(/Chưa có tài khoản nào/)).toBeInTheDocument()
    })
})
