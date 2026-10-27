import { afterEach, describe, expect, it, vi } from "vitest"
import { screen } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"

import { PortalShell } from "@/components/portal-shell"
import { renderWithProviders, stubFetch } from "../helpers/render"

afterEach(() => {
    vi.unstubAllGlobals()
})

const me = (role: "ADMIN" | "OPERATOR") => ({
    body: {
        id: "u1",
        username: "ada",
        displayName: "Ada Lovelace",
        role,
        emailVerified: true,
        totpEnabled: true,
        avatarUrl: null,
    },
})

function renderShell(path: string) {
    return renderWithProviders(
        <MemoryRouter initialEntries={[path]}>
            <Routes>
                <Route element={<PortalShell />}>
                    <Route path="/" element={<p>list page</p>} />
                    <Route path="/questions" element={<p>questions page</p>} />
                    <Route path="/mcp-keys" element={<p>keys page</p>} />
                    <Route path="/operators" element={<p>operators page</p>} />
                    <Route path="/tournaments/:tournamentId" element={<p>tournament page</p>} />
                    <Route path="/tournaments/:tournamentId/matches/:matchId" element={<p>match page</p>} />
                </Route>
            </Routes>
        </MemoryRouter>
    )
}

describe("PortalShell", () => {
    it("shows the feature nav, the child page and the signed-in user", async () => {
        stubFetch({ "GET /portal/auth/me": me("ADMIN") })
        renderShell("/")

        expect(await screen.findByText("list page")).toBeInTheDocument()
        expect(screen.getByText("Tournaments")).toBeInTheDocument()
        expect(screen.getByText("Questions")).toBeInTheDocument()
        expect(screen.getByText("MCP keys")).toBeInTheDocument()
        // admin sees the admin-only item
        expect(await screen.findByText("Operators")).toBeInTheDocument()
        // user + sign out live in the sidebar footer
        expect(screen.getByText("Ada Lovelace")).toBeInTheDocument()
        expect(screen.getByRole("button", { name: /Sign out/ })).toBeInTheDocument()
    })

    it("hides the Operators item from a non-admin", async () => {
        stubFetch({ "GET /portal/auth/me": me("OPERATOR") })
        renderShell("/")

        expect(await screen.findByText("Ada Lovelace")).toBeInTheDocument()
        expect(screen.getByText("Questions")).toBeInTheDocument()
        expect(screen.queryByText("Operators")).toBeNull()
    })

    it("marks the nav item of the open page as current", async () => {
        stubFetch({ "GET /portal/auth/me": me("ADMIN") })
        renderShell("/questions")

        expect(await screen.findByText("questions page")).toBeInTheDocument()
        expect(screen.getByRole("link", { name: "Questions" })).toHaveAttribute("aria-current", "page")
        expect(screen.getByRole("link", { name: "Tournaments" })).not.toHaveAttribute("aria-current")
    })

    it("shows the controller context on a match page — state, not a route", async () => {
        stubFetch({
            "GET /portal/auth/me": me("ADMIN"),
            "GET /portal/tournaments/t1/matches?limit=100": {
                body: {
                    items: [{ id: "m1", label: "Slot 2 · Match", status: "LIVE" }],
                    total: 1,
                },
            },
        })
        renderShell("/tournaments/t1/matches/m1")

        expect(await screen.findByText("match page")).toBeInTheDocument()
        expect(await screen.findByText("Slot 2 · Match")).toBeInTheDocument()
        expect(screen.getByText("LIVE")).toBeInTheDocument()
        // the sidebar shows NO route — wayfinding stays on the page's breadcrumb
        expect(screen.queryByRole("link", { name: /t1/ })).toBeNull()
    })

    it("shows no context block on the tournament page (its breadcrumb does the job)", async () => {
        stubFetch({ "GET /portal/auth/me": me("ADMIN") })
        renderShell("/tournaments/t1")

        expect(await screen.findByText("tournament page")).toBeInTheDocument()
        expect(screen.queryByText(/LIVE/)).toBeNull()
        expect(screen.queryByText(/t1/)).toBeNull()
    })
})
