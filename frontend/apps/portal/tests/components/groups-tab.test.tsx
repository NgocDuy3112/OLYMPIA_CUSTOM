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


const line = (userId: string, displayName: string, bankedPoints: number, matchesPlayed = 1, avg: number | null = null) => ({
    userId,
    displayName,
    matchesPlayed,
    bankedPoints,
    averages: { phase1: null, phase2: null, all: avg },
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
        // the group totals, now named: "Tổng điểm nhóm <n>"
        const totals = screen.getAllByText("Tổng điểm nhóm").map((el) => el.parentElement?.textContent?.replace(/\s+/g, " "))
        expect(totals).toHaveLength(2)
        expect(totals.join(" | ")).toContain("4")
        expect(totals.join(" | ")).toContain("0")
    })

    it("keeps the frame's placeholder seats visible while a group is under-filled", async () => {
        stubFetch({ [GROUPS_URL]: { body: tables() } })
        render()

        await screen.findByText("An")
        // Nhóm A holds 2 of 4; Nhóm B holds 0 of 4 → 6 placeholder rows, each with
        // three em-dashes now (name · Điểm nhóm · Thành tích trung bình).
        const emptyRows = screen
            .getAllByRole("row")
            .filter((row) => [...row.querySelectorAll("td")].filter((td) => (td.textContent || "").trim() === "—").length === 3)
        expect(emptyRows).toHaveLength(6)
        // No cap is implied: the count is just how many are drawn.
        expect(screen.getByText(/^2 seats · thứ hạng ở trận vòng bảng/)).toBeInTheDocument()
        expect(screen.getByText(/^0 seats · thứ hạng ở trận vòng bảng/)).toBeInTheDocument()
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
        // an EMPTY ROSTER is not "everyone is drawn": say where contestants are added
        expect(screen.getByText(/add them in the Thí sinh tab/)).toBeInTheDocument()
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

describe("the two numbers on a group row", () => {
    it("names the group's total instead of a bare '0 pts'", async () => {
        stubFetch({ [GROUPS_URL]: { body: tables({ aPoints: 3 }) } })
        render()
        // one label per group card, each carrying its own number
        const totals = (await screen.findAllByText("Tổng điểm nhóm")).map((el) => el.parentElement?.textContent?.replace(/\s+/g, " "))
        expect(totals).toHaveLength(2)
        expect(totals.join(" | ")).toContain("3")
    })

    it("labels the per-contestant column Điểm nhóm (it is not their score)", async () => {
        stubFetch({ [GROUPS_URL]: { body: tables() } })
        render()
        expect(await screen.findAllByText("Điểm nhóm")).toHaveLength(2)
    })

    it("gives the average its OWN column, next to Điểm nhóm", async () => {
        stubFetch({ [GROUPS_URL]: { body: tables({ a: [line("u1", "An", 3, 4, 12.5)] }) } })
        render()

        // two headers, two different numbers: rank paid the group, average per match
        expect((await screen.findAllByText("Thành tích trung bình")).length).toBe(2)
        expect(screen.getAllByText("Điểm nhóm").length).toBe(2)

        const row = screen.getByText("An").closest("tr")!
        const cells = [...row.querySelectorAll("td")].map((td) => (td.textContent || "").trim())
        expect(cells[2]).toBe("3")      // Điểm nhóm
        expect(cells[3]).toBe("12.5")   // Thành tích trung bình
    })

    it("shows — in that column when they have played nothing", async () => {
        stubFetch({ [GROUPS_URL]: { body: tables({ a: [line("u1", "An", 0, 0, null)] }) } })
        render()

        const row = (await screen.findByText("An")).closest("tr")!
        const cells = [...row.querySelectorAll("td")].map((td) => (td.textContent || "").trim())
        expect(cells[3]).toBe("—")
    })
})
