import { afterEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { AddToMatchDialog } from "@/pages/questions/AddToMatchDialog"
import type { BankQuestion } from "@/pages/questions/model"
import { renderWithProviders } from "../helpers/render"

afterEach(() => {
    vi.unstubAllGlobals()
})

const row: BankQuestion = {
    id: "q1",
    kind: "TEXT",
    questionText: "Sự kiện nào diễn ra vào cuối tháng 4 năm 1975?",
    status: "PUBLISHED",
    tags: ["khoi-dong:chung"],
    payload: { acceptedAnswers: ["Giải phóng miền Nam"] },
    updatedAt: "2026-10-01T00:00:00.000Z",
}

const tournament = {
    id: "t1",
    name: "Mùa 2026",
    format: { competitorsPerMatch: 3, allowedCompetitorCounts: [3, 4] },
}

const match = { id: "m1", label: "Bảng 1", stageId: "s1", slot: 1, status: "UPCOMING", assemblyRevision: 3, questions: [] }

const ASSEMBLE_URL = "PATCH /portal/tournaments/t1/matches/m1/assemble"

function draw(detail: { body: unknown; status?: number }) {
    return renderWithProviders(
        <AddToMatchDialog rows={[row]} onClose={() => {}} />,
        {
            routes: {
                "GET /portal/tournaments?limit=50&offset=0": { body: { items: [tournament], total: 1 } },
                "GET /portal/tournaments/t1/matches?limit=100": { body: { items: [match], total: 1 } },
                "GET /portal/questions/q1/usage": { body: { items: [] } },
                "GET /portal/tournaments/t1/matches/m1": detail,
                [ASSEMBLE_URL]: { body: { assemblyRevision: 8 } },
            },
        }
    )
}

async function chooseMatch() {
    const user = userEvent.setup()
    await screen.findByRole("option", { name: tournament.name })
    await user.selectOptions(await screen.findByLabelText("Giải đấu"), "t1")
    await user.selectOptions(await screen.findByLabelText("Trận UPCOMING"), "m1")
    return user
}

describe("AddToMatchDialog — the revision it assembles against", () => {
    it("takes baseRevision from the match detail, never from the list", async () => {
        const { fetchMock } = draw({ body: { ...match, assemblyRevision: 7, assemblyEvents: [] } })
        const user = await chooseMatch()

        await user.click(screen.getByRole("button", { name: "Thêm vào trận" }))

        const call = await waitFor(() => {
            const found = fetchMock?.mock.calls.find(([url]) => String(url).endsWith("/assemble"))
            expect(found).toBeTruthy()
            return found
        })
        expect(JSON.parse(call?.[1]?.body as string).baseRevision).toBe(7)
    })

    it("will not submit while the current revision is unknown", async () => {
        const { fetchMock } = draw({ status: 500, body: { message: "boom" } })
        const user = await chooseMatch()

        const submit = await screen.findByRole("button", { name: "Thêm vào trận" })
        await waitFor(() => expect(submit).toBeDisabled())
        await user.click(submit)

        expect(fetchMock?.mock.calls.some(([url]) => String(url).endsWith("/assemble"))).toBe(false)
        expect(within(screen.getByRole("dialog")).getByLabelText("Trận UPCOMING")).toHaveValue("m1")
    })
})
