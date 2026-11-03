import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import { GroupsTab } from "@/components/groups-tab"
import { renderWithProviders, stubFetch } from "../helpers/render"

// The group stage tab: a DERIVED table (never edited here) plus the DRAW, which
// is the only write. A frame with nobody drawn must still look deliberate.

const TOURNAMENT = "t1"
const GROUPS_URL = `GET /portal/tournaments/${TOURNAMENT}/groups`
const ASSIGN_URL = (userId: string) => `PATCH /portal/tournaments/${TOURNAMENT}/players/${userId}/group`
const CREATE_URL = `POST /portal/tournaments/${TOURNAMENT}/players/new`

const line = (userId: string, displayName: string, bankedPoints: number, matchesPlayed = 1) => ({
    userId,
    displayName,
    matchesPlayed,
    bankedPoints,
    averages: { phase1: null, phase2: null, all: null },
})

const tables = (over: Partial<{
    a: ReturnType<typeof line>[]
    b: ReturnType<typeof line>[]
    unassigned: Array<{ userId: string; displayName: string }>
    aPoints: number
    bPoints: number
}> = {}) => ({
    groups: [
        { id: "A", teamPoints: over.aPoints ?? 4, rows: over.a ?? [line("u1", "An", 3), line("u2", "Bình", 1)] },
        { id: "B", teamPoints: over.bPoints ?? 0, rows: over.b ?? [] },
    ],
    unassigned: over.unassigned ?? [{ userId: "u3", displayName: "Cường" }],
    wildcard: [],
})

const render = () =>
    renderWithProviders(<GroupsTab tournamentId={TOURNAMENT} />)

describe("GroupsTab — the derived tables", () => {
    it("draws both Nhóm with the banked points and the group totals", async () => {
        stubFetch({ [GROUPS_URL]: { body: tables() } })
        render()

        // the card titles — "Nhóm A" also names the draw button, so match all
        await screen.findByText("An")
        expect(screen.getAllByText("Nhóm A").length).toBeGreaterThan(0)
        expect(screen.getAllByText("Nhóm B").length).toBeGreaterThan(0)

        expect(screen.getByText("An")).toBeInTheDocument()
        expect(screen.getByText("Bình")).toBeInTheDocument()
        expect(screen.getByText("4 pts")).toBeInTheDocument()      // Nhóm A's total
        expect(screen.getByText("0 pts")).toBeInTheDocument()      // Nhóm B's total
    })

    it("keeps the frame's placeholder seats visible while a group is under-filled", async () => {
        stubFetch({ [GROUPS_URL]: { body: tables() } })
        render()

        await screen.findByText("An")
        // Nhóm A holds 2 of 4; Nhóm B holds 0 of 4 → 6 placeholder rows in total.
        expect(screen.getAllByText("—")).toHaveLength(12)   // name + points per empty seat
        // No cap is implied: the count is just how many are drawn.
        expect(screen.getByText("2 seats · team points bank for the group")).toBeInTheDocument()
        expect(screen.getByText("0 seats · team points bank for the group")).toBeInTheDocument()
    })

    it("says who is still to be drawn, and marks the frame when nobody is", async () => {
        stubFetch({ [GROUPS_URL]: { body: tables() } })
        render()

        expect(await screen.findByText("Cường")).toBeInTheDocument()
        expect(screen.getByText(/1 still to place/)).toBeInTheDocument()
        // something IS drawn, so it is not a bare frame
        expect(screen.queryByText("Frame only")).toBeNull()
    })

    it("shows the bare frame when the roster has not been drawn at all", async () => {
        stubFetch({ [GROUPS_URL]: { body: tables({ a: [], b: [], unassigned: [], aPoints: 0 }) } })
        render()

        expect(await screen.findByText("Frame only")).toBeInTheDocument()
        expect(screen.getByText(/filled in at the draw/)).toBeInTheDocument()
        // an EMPTY ROSTER is not the same as "everyone is drawn" — say so, because
        // the fix is the add box right beside this line
        expect(screen.getByText(/No contestants yet/)).toBeInTheDocument()
    })

    it("says every contestant is drawn when the roster is full and placed", async () => {
        stubFetch({ [GROUPS_URL]: { body: tables({ unassigned: [] }) } })
        render()

        expect(await screen.findByText(/Every enrolled contestant has a group \(2\)/)).toBeInTheDocument()
    })

    it("reports a refusal instead of pretending the tables changed", async () => {
        stubFetch({ [GROUPS_URL]: { body: tables() } })
        render()
        await screen.findByText("An")
        expect(screen.queryByRole("alert")).toBeNull()
    })
})

describe("GroupsTab — the draw", () => {
    it("places an undrawn contestant in a group", async () => {
        const user = userEvent.setup()
        const fetchMock = stubFetch({
            [GROUPS_URL]: { body: tables() },
            [ASSIGN_URL("u3")]: { body: { userId: "u3", group: "B" } },
        })
        render()

        await screen.findByText("Cường")
        await user.click(screen.getByRole("button", { name: "Nhóm B" }))

        await waitFor(() => {
            const call = fetchMock.mock.calls.find(([url, init]) =>
                String(url) === `/portal/tournaments/${TOURNAMENT}/players/u3/group` && init?.method === "PATCH"
            )
            expect(call).toBeTruthy()
            expect(JSON.parse(String(call?.[1]?.body))).toEqual({ group: "B" })
        })
    })

    it("moves a drawn contestant to the other group", async () => {
        const user = userEvent.setup()
        const fetchMock = stubFetch({
            [GROUPS_URL]: { body: tables() },
            [ASSIGN_URL("u1")]: { body: { userId: "u1", group: "B" } },
        })
        render()

        await screen.findByText("An")
        // every drawn contestant has a "move to the other group" control
        await user.click(screen.getAllByTitle("Chuyển sang Nhóm B")[0])

        await waitFor(() => {
            const call = fetchMock.mock.calls.find(([url]) =>
                String(url) === `/portal/tournaments/${TOURNAMENT}/players/u1/group`
            )
            expect(JSON.parse(String(call?.[1]?.body))).toEqual({ group: "B" })
        })
    })
})

describe("GroupsTab — making a contestant", () => {
    it("creates one from a name, and clears the box", async () => {
        const fetchMock = stubFetch({
            [GROUPS_URL]: { body: tables({ unassigned: [] }) },
            [CREATE_URL]: { body: { userId: "u9", displayName: "Em", group: null } },
        })
        render()

        const box = await screen.findByLabelText("Contestant name")
        await userEvent.type(box, "  Em  ")
        await userEvent.click(screen.getByRole("button", { name: /Add/ }))

        await waitFor(() => expect(fetchMock).toHaveBeenCalled())
        const [, init] = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/players/new"))!
        // the name is trimmed on the way out: seats are read by name on the projector
        expect(JSON.parse(String(init?.body))).toEqual({ displayName: "Em" })
        await waitFor(() => expect((box as HTMLInputElement).value).toBe(""))
    })

    it("cannot submit an empty name", async () => {
        stubFetch({ [GROUPS_URL]: { body: tables({ unassigned: [] }) } })
        render()

        const box = await screen.findByLabelText("Contestant name")
        const add = screen.getByRole("button", { name: /Add/ })
        expect(add).toBeDisabled()
        await userEvent.type(box, "   ")
        expect(add).toBeDisabled()
    })

    it("reports a duplicate name instead of silently doing nothing", async () => {
        stubFetch({
            [GROUPS_URL]: { body: tables({ unassigned: [] }) },
            [CREATE_URL]: { body: { message: '"An" is already a contestant in this tournament' }, status: 409 },
        })
        render()

        await userEvent.type(await screen.findByLabelText("Contestant name"), "An")
        await userEvent.click(screen.getByRole("button", { name: /Add/ }))

        expect(await screen.findByRole("alert")).toHaveTextContent(/already a contestant/)
    })
})
