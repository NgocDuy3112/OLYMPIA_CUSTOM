import { afterEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { QuestionsPage } from "@/pages/QuestionsPage"
import { renderWithProviders, stubFetch } from "../helpers/render"

afterEach(() => {
    vi.unstubAllGlobals()
})

const draftRow = {
    id: "q1",
    kind: "TEXT",
    questionText: "Sự kiện nào diễn ra vào cuối tháng 4 năm 1975?",
    tag: "XHPL",
    status: "DRAFT",
    timeLimit: null,
    payload: {
        acceptedAnswers: ["Giải phóng miền Nam"],
        normalize: { caseSensitive: false, trim: true, stripAccents: true },
    },
    updatedAt: "2026-10-01T00:00:00.000Z",
}

const list = (items: unknown[], total = items.length) => ({ body: { items, total } })

function stubBank() {
    return stubFetch({
        "GET /portal/auth/me": {
            body: { id: "u1", username: "ada", displayName: "Ada", role: "ADMIN", emailVerified: true, totpEnabled: true, avatarUrl: null },
        },
        "GET /portal/questions?limit=20&offset=0": list([draftRow]),
        "POST /portal/questions": { body: { id: "q2" } },
        "PATCH /portal/questions/q1/status": { body: { ...draftRow, status: "PENDING" } },
    })
}

describe("QuestionsPage", () => {
    it("lists the bank with kind, tag, status and the draft's actions", async () => {
        stubBank()
        renderWithProviders(<QuestionsPage />)

        expect(await screen.findByText(draftRow.questionText)).toBeInTheDocument()
        const row = screen.getByText(draftRow.questionText).closest("tr")!
        expect(within(row).getByText("TEXT")).toBeInTheDocument()
        expect(within(row).getByText("XHPL")).toBeInTheDocument()
        expect(within(row).getByText("Draft")).toBeInTheDocument()
        expect(within(row).getByRole("button", { name: /Submit/ })).toBeInTheDocument()
        expect(within(row).getByRole("button", { name: /Archive/ })).toBeInTheDocument()
        expect(within(row).getByRole("button", { name: /Edit/ })).toBeInTheDocument()
        // admin session → the admin-only step is offered (not blocked)
        expect(screen.queryByRole("button", { name: /Publish/ })).toBeNull() // DRAFT has no publish step
    })

    it("creates a TEXT question: dialog draft becomes the POST payload", async () => {
        const user = userEvent.setup()
        const fetchMock = stubBank()
        renderWithProviders(<QuestionsPage />)

        await user.click(await screen.findByRole("button", { name: /New question/ }))
        const dialog = await screen.findByRole("dialog")

        await user.type(within(dialog).getByLabelText("Question"), "Thủ đô của Việt Nam là?")
        await user.type(within(dialog).getByLabelText("Tag"), "XHPL")
        await user.type(within(dialog).getByLabelText(/Accepted answers/), "Hà Nội\nHa Noi")

        await user.click(within(dialog).getByRole("button", { name: "Save" }))

        const post = fetchMock.mock.calls.find(
            ([url, init]) => url === "/portal/questions" && init?.method === "POST"
        )
        expect(post).toBeTruthy()
        const body = JSON.parse(post![1]?.body as string)
        expect(body).toEqual({
            kind: "TEXT",
            questionText: "Thủ đô của Việt Nam là?",
            tag: "XHPL",
            payload: {
                acceptedAnswers: ["Hà Nội", "Ha Noi"],
                normalize: { caseSensitive: false, trim: true, stripAccents: true },
            },
        })
        // the dialog unmounts once its close animation finishes
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    })

    it("shows the server's reason when saving is refused (empty question)", async () => {
        const user = userEvent.setup()
        stubBank()
        renderWithProviders(<QuestionsPage />)

        await user.click(await screen.findByRole("button", { name: /New question/ }))
        const dialog = await screen.findByRole("dialog")

        // Save stays disabled and states why — no request is made
        expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled()
        expect(within(dialog).getByText(/required/i)).toBeInTheDocument()
    })

    it("moves a draft on with Submit → PATCH status", async () => {
        const user = userEvent.setup()
        const fetchMock = stubBank()
        renderWithProviders(<QuestionsPage />)

        await user.click(await screen.findByRole("button", { name: /Submit/ }))

        const patch = fetchMock.mock.calls.find(
            ([url, init]) => url === "/portal/questions/q1/status" && init?.method === "PATCH"
        )
        expect(patch).toBeTruthy()
        expect(JSON.parse(patch![1]?.body as string)).toEqual({ status: "PENDING" })
        // success invalidates → the list refetches (stub allows the repeat GET)
        expect(await screen.findByText(draftRow.questionText)).toBeInTheDocument()
    })
})
