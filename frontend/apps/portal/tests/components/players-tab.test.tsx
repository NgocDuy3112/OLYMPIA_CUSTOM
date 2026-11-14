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
    over: Partial<{
        username: string
        discordId: string | null
    }> = {}
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

describe("the Thí sinh tab — now a read-only window onto the roster", () => {
    it("shows a name and the account it belongs to", async () => {
        draw()
        expect(await screen.findByText("An")).toBeInTheDocument()
        expect(screen.getByText("binh@example.test")).toBeInTheDocument()
    })

    it("shows the handle they sign in with, and says when there is no address", async () => {
        draw()
        await screen.findByText("An")
        expect(screen.getByText("an")).toBeInTheDocument()
        expect(screen.getByText("không có địa chỉ")).toBeInTheDocument()
        expect(screen.getByText("binh")).toBeInTheDocument()
    })

    it("just counts the rows — no password column left to report on", async () => {
        draw([
            row("u1", "Chưa Có"),
            row("u2", "Bình", "binh@example.test"),
        ])
        expect(await screen.findByText(/2 contestants — xem và sửa ở trang Thí sinh/)).toBeInTheDocument()
        expect(screen.queryByText(/mật khẩu/)).toBeNull()
    })

    it("keeps the group column, including the not-yet-drawn case", async () => {
        draw([row("u1", "An", null, "A"), row("u2", "Bình", null)])
        await screen.findByText("An")
        expect(screen.getByText("Nhóm A")).toBeInTheDocument()
        expect(screen.getByText("chưa xếp")).toBeInTheDocument()
    })

    it("points at the right first step when the roster is empty", async () => {
        draw([])
        expect(await screen.findByText(/No contestants yet/)).toBeInTheDocument()
        expect(screen.getByText(/ghi danh họ ở trang Thí sinh trước/)).toBeInTheDocument()
    })

    it("offers NO tools: no add, no edit, no password, no drop — not even an Actions column", async () => {
        draw()
        await screen.findByText("An")

        expect(screen.queryByRole("button", { name: /Thêm thí sinh/ })).toBeNull()
        expect(screen.queryAllByRole("button", { name: /Sửa/ })).toHaveLength(0)
        expect(screen.queryAllByRole("button", { name: /Đặt mật khẩu/ })).toHaveLength(0)
        expect(screen.queryAllByRole("button", { name: /Bỏ/ })).toHaveLength(0)
        expect(screen.queryByText("Actions")).toBeNull()
    })

    it("sends the desk to the roster page instead, when they ask to manage", async () => {
        draw()
        await screen.findByText("An")

        await userEvent.click(screen.getByRole("link", { name: /Quản lý thí sinh/ }))
        await waitFor(() => expect(screen.getByText("the roster desk")).toBeInTheDocument())
    })
})
