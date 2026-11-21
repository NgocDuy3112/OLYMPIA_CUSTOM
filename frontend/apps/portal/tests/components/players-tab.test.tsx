import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { describe, expect, it } from "vitest"
import { PlayersTab } from "@/components/players-tab"
import { renderWithProviders } from "../helpers/render"


const TOURNAMENT = "t1"
const ROSTER_URL = `GET /portal/tournaments/${TOURNAMENT}/players`

const row = (
    userId: string,
    displayName: string,
    email: string | null = null,
    group: "A" | "B" | null = null,
    over: Partial<{ username: string; discordId: string | null }> = {}
) => ({
    userId,
    displayName,
    username: email ? email.split("@")[0]! : displayName.toLowerCase().replace(/\s+/g, "-"),
    email,
    discordId: null as string | null,
    group,
    enrolledAt: "2026-11-03T00:00:00.000Z",
    ...over,
})

const roster = (items: ReturnType<typeof row>[]) => ({ items })

const draw = (items = [row("u1", "An"), row("u2", "Bình", "binh@example.test")]) =>
    renderWithProviders(
        <MemoryRouter initialEntries={[`/tournaments/${TOURNAMENT}`]}>
            <Routes>
                <Route
                    path="/tournaments/:tournamentId"
                    element={<PlayersTab tournamentId={TOURNAMENT} />}
                />
                <Route path="/players" element={<p>the roster desk</p>} />
            </Routes>
        </MemoryRouter>,
        { routes: { [ROSTER_URL]: { body: roster(items) } } }
    )

describe("the Thí sinh tab — a window onto the roster", () => {
    it("counts the roster members next to the Manage action", async () => {
        draw()
        expect(await screen.findByText(/2 contestants — xem và sửa ở trang Thí sinh/)).toBeInTheDocument()
        expect(screen.getByRole("link", { name: /Quản lý thí sinh/ })).toBeInTheDocument()
    })

    it("counts a single member without the plural", async () => {
        draw([row("u1", "An")])
        expect(await screen.findByText(/1 contestant — xem và sửa ở trang Thí sinh/)).toBeInTheDocument()
    })

    it("shows the first step when the roster is empty", async () => {
        draw([])
        expect(await screen.findByText(/No contestants yet/)).toBeInTheDocument()
    })

    it("offers no editing tools — only the Manage link", async () => {
        draw()
        await screen.findByText(/2 contestants/)

        expect(screen.queryByRole("button", { name: /Thêm thí sinh/ })).toBeNull()
        expect(screen.queryAllByRole("button", { name: /Sửa/ })).toHaveLength(0)
        expect(screen.queryAllByRole("button", { name: /Đặt mật khẩu/ })).toHaveLength(0)
        expect(screen.queryAllByRole("button", { name: /Bỏ/ })).toHaveLength(0)
    })

    it("sends the desk to the roster page when they ask to manage", async () => {
        draw()
        await screen.findByText(/2 contestants/)

        await userEvent.click(screen.getByRole("link", { name: /Quản lý thí sinh/ }))
        await waitFor(() => expect(screen.getByText("the roster desk")).toBeInTheDocument())
    })
})
