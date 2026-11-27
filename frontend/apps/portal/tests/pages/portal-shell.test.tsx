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

    it("keeps a name and a tooltip on every nav item when the rail is compact", async () => {
        // Below lg the rail drops its labels and shows icons only, so the
        // accessible name and the tooltip have to carry the item on their own.
        renderShell()

        for (const label of ["Tournaments", "Thí sinh", "Questions", "MCP keys", "Operators", "Audit log"]) {
            const link = await screen.findByRole("link", { name: label })
            expect(link).toHaveAttribute("title", label)
        }
    })

    it("names the nav landmark, so the shell has no anonymous navigation region", async () => {
        renderShell()

        const nav = await screen.findByRole("navigation", { name: "Main navigation" })
        expect(nav).toBeInTheDocument()
    })

    it("marks the current section for assistive tech", async () => {
        renderShell()

        const current = await screen.findByRole("link", { name: "Tournaments" })
        expect(current).toHaveAttribute("aria-current", "page")
    })
})
