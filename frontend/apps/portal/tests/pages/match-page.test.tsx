import { afterEach, describe, expect, it, vi } from "vitest"
import { screen } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"

import { MatchPage } from "@/pages/MatchPage"
import { renderWithProviders } from "../helpers/render"

afterEach(() => {
    vi.unstubAllGlobals()
})

describe("MatchPage", () => {
    it("shows its loading state inside the page frame, announced", () => {
        // Never resolves: the page stays in its pending branch.
        vi.stubGlobal("fetch", () => new Promise(() => {}))

        renderWithProviders(
            <MemoryRouter initialEntries={["/tournaments/t1/matches/m1"]}>
                <Routes>
                    <Route path="/tournaments/:tournamentId/matches/:matchId" element={<MatchPage />} />
                </Routes>
            </MemoryRouter>,
        )

        expect(screen.getByRole("status", { name: "Đang tải trận" })).toBeInTheDocument()
    })
})
