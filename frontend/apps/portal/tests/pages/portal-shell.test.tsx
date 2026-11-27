import { afterEach, describe, expect, it, vi } from "vitest"
import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, Route, Routes } from "react-router-dom"

import { PortalShell } from "@/components/portal-shell"
import { renderWithProviders } from "../helpers/render"

afterEach(() => {
    vi.unstubAllGlobals()
})

const ME = { id: "u1", role: "ADMIN", username: "duy", displayName: "Duy" }

function renderShell() {
    return renderWithProviders(
        <MemoryRouter initialEntries={["/"]}>
            <Routes>
                <Route element={<PortalShell />}>
                    <Route path="/" element={<p>Tournaments body</p>} />
                </Route>
            </Routes>
        </MemoryRouter>,
        { routes: { "GET /portal/auth/me": { body: ME } } },
    )
}

describe("PortalShell", () => {
    it("puts a skip link first in the tab order so keyboard users can bypass the nav", async () => {
        const user = userEvent.setup()
        renderShell()

        expect(await screen.findByText("Tournaments body")).toBeInTheDocument()

        await user.tab()
        expect(document.activeElement).toBe(
            screen.getByRole("link", { name: "Skip to content" })
        )
        expect(screen.getByRole("main")).toHaveAttribute("id", "portal-main")
    })

    it("marks the current section for assistive tech", async () => {
        renderShell()

        const current = await screen.findByRole("link", { name: "Tournaments" })
        expect(current).toHaveAttribute("aria-current", "page")
    })
})
