import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { describe, expect, it } from "vitest"
import { MatchesTab } from "@/components/matches-tab"
import { renderWithProviders } from "../helpers/render"
import type { TournamentDetail } from "@/lib/tournament"


const TOURNAMENT = "t1"
const ME_URL = "GET /portal/auth/me"
const MATCHES_URL = `GET /portal/tournaments/${TOURNAMENT}/matches?limit=100`
const ENROLLED_URL = `GET /portal/tournaments/${TOURNAMENT}/players`
const CODES_URL = `GET /portal/tournaments/${TOURNAMENT}/match-codes`
const ROTATE_URL = (matchId: string) => `POST /portal/tournaments/${TOURNAMENT}/matches/${matchId}/code`
const EJECT_URL = (matchId: string, userId: string) =>
    `DELETE /portal/tournaments/${TOURNAMENT}/matches/${matchId}/players/${userId}`

const tournament = {
    id: TOURNAMENT,
    format: { competitorsPerMatch: 3, allowedCompetitorCounts: [3, 4] },
} as unknown as TournamentDetail

const seat = (userId: string, seed: number) => ({ kind: "user" as const, userId, seed })

const match = (over: Partial<Record<string, unknown>> = {}) => ({
    id: "m1",
    stageId: "s1",
    slot: 1,
    label: "Bảng 1",
    status: "UPCOMING",
    scheduledAt: "2026-11-04T09:00:00.000Z",
    players: [seat("u1", 1), seat("u2", 2)],
    questions: [],
    ...over,
})

const roster = { items: [{ userId: "u1", displayName: "An", email: "an@example.test", emailVerified: true, group: null, enrolledAt: "" }] }

const me = (role: "ADMIN" | "OPERATOR") => ({
    body: { id: "u0", username: "root", displayName: "Root", role, emailVerified: true, totpEnabled: false, avatarUrl: null },
})

const draw = (
    routes: Record<string, { body: unknown; status?: number }>,
    role: "ADMIN" | "OPERATOR" = "ADMIN"
) =>
    renderWithProviders(
        <MemoryRouter>
            <MatchesTab tournamentId={TOURNAMENT} tournament={tournament} seats={4} />
        </MemoryRouter>,
        {
            routes: {
                [ME_URL]: me(role),
                [MATCHES_URL]: { body: { items: [match()], total: 1, limit: 100, offset: 0 } },
                [ENROLLED_URL]: { body: roster },
                ...routes,
            },
        }
    )

const callKey = (call: [RequestInfo | URL, RequestInit?]) =>
    `${call[1]?.method ?? "GET"} ${String(call[0])}`

const callOf = (fetchMock: ReturnType<typeof draw>["fetchMock"], key: string) =>
    fetchMock?.mock.calls.find((call) => callKey(call) === key)

describe("the room code in the matches tab", () => {
    it("shows the code where the PIN used to be, with a rotate action", async () => {
        draw({ [CODES_URL]: { body: { items: [{ matchId: "m1", code: "ABC234", expiresAt: "2026-11-05T09:00:00.000Z" }] } } })

        expect(await screen.findByText("Mã ABC234")).toBeInTheDocument()
        expect(screen.getByRole("button", { name: /Xoay/ })).toBeInTheDocument()
        expect(screen.getByRole("button", { name: "Control" })).toBeInTheDocument()
    })

    it("offers to mint one when the match has none yet", async () => {
        draw({ [CODES_URL]: { body: { items: [] } } })

        expect(await screen.findByRole("button", { name: /Tạo mã/ })).toBeInTheDocument()
        expect(screen.queryByText(/^Mã /)).toBeNull()
    })

    it("rotates on click — the old code dies on the server, the row stays", async () => {
        const { fetchMock } = draw({
            [CODES_URL]: { body: { items: [{ matchId: "m1", code: "ABC234", expiresAt: "2026-11-05T09:00:00.000Z" }] } },
            [ROTATE_URL("m1")]: { body: { matchId: "m1", code: "NEW999", expiresAt: "2026-11-05T10:00:00.000Z" } },
        })

        await screen.findByText("Mã ABC234")
        await userEvent.click(screen.getByRole("button", { name: /Xoay/ }))

        await waitFor(() => expect(callOf(fetchMock!, ROTATE_URL("m1"))).toBeTruthy())
        expect(screen.getByText("An")).toBeInTheDocument()
    })

    it("shows no code controls at all when this desk may not read them", async () => {
        draw({ [CODES_URL]: { status: 403, body: { message: "only the owner or an admin may manage this tournament" } } })

        expect(await screen.findByRole("button", { name: "Control" })).toBeInTheDocument()
        expect(screen.queryByRole("button", { name: /Xoay/ })).toBeNull()
        expect(screen.queryByRole("button", { name: /Tạo mã/ })).toBeNull()
        expect(screen.queryByText(/^Mã /)).toBeNull()
    })

    it("keeps the server's refusal on the tab", async () => {
        draw({
            [CODES_URL]: { body: { items: [] } },
            [ROTATE_URL("m1")]: { body: { message: "trận đã kết thúc — không còn mã vào" }, status: 409 },
        })

        await userEvent.click(await screen.findByRole("button", { name: /Tạo mã/ }))
        expect(await screen.findByRole("alert")).toHaveTextContent(/không còn mã vào/)
    })
})

describe("the match row as the door to its questions", () => {
    it("links the match name to the match page and says what is missing", async () => {
        draw({ [CODES_URL]: { body: { items: [] } } })

        const link = await screen.findByRole("link", { name: "Bảng 1" })
        expect(link).toHaveAttribute("href", `/tournaments/${TOURNAMENT}/matches/m1`)
        expect(screen.getByText("chưa có câu — nhấn để thêm")).toBeInTheDocument()
    })

    it("counts the questions once they are composed", async () => {
        draw({
            [MATCHES_URL]: {
                body: {
                    items: [match({ questions: [{ sourceId: "s1" }, { sourceId: "s2" }] })],
                    total: 1,
                    limit: 100,
                    offset: 0,
                },
            },
            [CODES_URL]: { body: { items: [] } },
        })

        expect(await screen.findByText("2 câu hỏi")).toBeInTheDocument()
    })
})

describe("taking a seat back", () => {
    it("offers an eject on each seat of an UPCOMING match, and sends it", async () => {
        const { fetchMock } = draw({
            [CODES_URL]: { body: { items: [] } },
            [EJECT_URL("m1", "u1")]: { status: 204, body: undefined },
        })

        const eject = await screen.findByRole("button", { name: "Gỡ An khỏi trận" })
        await userEvent.click(eject)

        await waitFor(() => expect(callOf(fetchMock!, EJECT_URL("m1", "u1"))).toBeTruthy())
    })

    it("offers no eject once the match is under way — the seats are the record", async () => {
        draw({
            [MATCHES_URL]: { body: { items: [match({ status: "LIVE" })], total: 1, limit: 100, offset: 0 } },
            [CODES_URL]: { body: { items: [{ matchId: "m1", code: "ABC234", expiresAt: "2026-11-05T09:00:00.000Z" }] } },
        })

        expect(await screen.findByText("An")).toBeInTheDocument()
        expect(screen.queryByRole("button", { name: /Gỡ/ })).toBeNull()
    })
})

describe("deleting a match", () => {
    const DELETE_URL = (matchId: string) =>
        `DELETE /portal/tournaments/${TOURNAMENT}/matches/${matchId}`

    it("confirms, then DELETEs the match", async () => {
        const { fetchMock } = draw({
            [CODES_URL]: { body: { items: [] } },
            [DELETE_URL("m1")]: { status: 204, body: undefined },
        })

        await userEvent.click(await screen.findByRole("button", { name: "Delete match Bảng 1" }))
        const dialog = await screen.findByRole("dialog")
        await userEvent.click(within(dialog).getByRole("button", { name: "Delete" }))

        await waitFor(() => expect(callOf(fetchMock!, DELETE_URL("m1"))).toBeTruthy())
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    })

    it("offers no delete to an operator — the endpoint is admin-only", async () => {
        const { fetchMock } = draw({ [CODES_URL]: { body: { items: [] } } }, "OPERATOR")

        expect(await screen.findByText("Bảng 1")).toBeInTheDocument()
        await waitFor(() => expect(callOf(fetchMock!, ME_URL)).toBeTruthy())
        expect(screen.queryByRole("button", { name: "Delete match Bảng 1" })).toBeNull()
    })

    it("offers no delete once the match is under way", async () => {
        draw({
            [MATCHES_URL]: { body: { items: [match({ status: "LIVE" })], total: 1, limit: 100, offset: 0 } },
            [CODES_URL]: { body: { items: [] } },
        })

        expect(await screen.findByRole("button", { name: "Delete match Bảng 1" })).toBeDisabled()
    })

    it("keeps the server's refusal in the dialog", async () => {
        draw({
            [CODES_URL]: { body: { items: [] } },
            [DELETE_URL("m1")]: { status: 409, body: { message: "match m1 is LIVE and cannot be deleted" } },
        })

        await userEvent.click(await screen.findByRole("button", { name: "Delete match Bảng 1" }))
        const dialog = await screen.findByRole("dialog")
        await userEvent.click(within(dialog).getByRole("button", { name: "Delete" }))

        expect(await screen.findByRole("alert")).toHaveTextContent(/cannot be deleted/)
        expect(screen.getByRole("dialog")).toBeInTheDocument()
    })
})
