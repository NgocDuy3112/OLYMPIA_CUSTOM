import { afterEach, describe, expect, it, vi } from "vitest"
import { screen } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"

import { RequireAuth } from "@/components/require-auth"
import { renderWithProviders, stubFetch } from "../helpers/render"

const SESSION = {
    id: "u1",
    username: "ADMIN",
    displayName: "ADMIN",
    role: "ADMIN",
    emailVerified: false,
    totpEnabled: true,
    avatarUrl: null,
}

function renderGuarded() {
    return renderWithProviders(
        <MemoryRouter initialEntries={["/"]}>
            <Routes>
                <Route
                    path="/"
                    element={
                        <RequireAuth>
                            <p>secret area</p>
                        </RequireAuth>
                    }
                />
                <Route path="/login" element={<p>login page</p>} />
            </Routes>
        </MemoryRouter>,
    )
}

afterEach(() => {
    vi.unstubAllGlobals()
})

describe("RequireAuth", () => {
    it("renders children when the session is valid", async () => {
        stubFetch({ "GET /portal/auth/me": { body: SESSION } })
        renderGuarded()

        expect(await screen.findByText("secret area")).toBeInTheDocument()
    })

    it("redirects to /login when the session is gone", async () => {
        stubFetch({
            "GET /portal/auth/me": { body: { message: "Missing session cookie" }, status: 401 },
        })
        renderGuarded()

        expect(await screen.findByText("login page")).toBeInTheDocument()
        expect(screen.queryByText("secret area")).not.toBeInTheDocument()
    })
})