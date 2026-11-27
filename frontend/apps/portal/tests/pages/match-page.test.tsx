import { afterEach, describe, expect, it, vi } from "vitest"
import { screen } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"

import { MatchPage } from "@/pages/MatchPage"
import { renderWithProviders } from "../helpers/render"

afterEach(() => {
    vi.unstubAllGlobals()
})

function renderPending() {
    // Never resolves: the page stays in its pending branch.
    vi.stubGlobal("fetch", () => new Promise(() => {}))

    return renderWithProviders(
        <MemoryRouter initialEntries={["/tournaments/t1/matches/m1"]}>
            <Routes>
                <Route path="/tournaments/:tournamentId/matches/:matchId" element={<MatchPage />} />
            </Routes>
        </MemoryRouter>,
    )
}

describe("MatchPage loading", () => {
    it("stays announced while it loads", () => {
        renderPending()

        expect(screen.getByRole("status", { name: "Đang tải trận" })).toBeInTheDocument()
    })

    it("loads inside the portal page frame, not on its own measure", () => {
        // Regression: the pending branch used to return the standalone
        // LoadingState wrapper (max-w-360, no sm/lg gutter), so the skeleton sat
        // on a different measure and inset than every other page.
        renderPending()

        const status = screen.getByRole("status", { name: "Đang tải trận" })
        const frame = status.closest("[class*='max-w-6xl']")
        expect(frame).not.toBeNull()
        expect(status.closest("[class*='max-w-360']")).toBeNull()
    })

    it("shows the list skeleton, not one tall loading block", () => {
        const { container } = renderPending()

        // ListSkeleton rows={3}: three bars. The standalone LoadingState drew a
        // single h-96 block instead.
        expect(container.querySelectorAll(".animate-pulse")).toHaveLength(3)
        expect(container.querySelector(".h-96")).toBeNull()
    })
})
