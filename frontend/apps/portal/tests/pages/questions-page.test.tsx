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
    status: "DRAFT",
    timeLimit: null,
    payload: {
        acceptedAnswers: ["Giải phóng miền Nam"],
    },
    updatedAt: "2026-10-01T00:00:00.000Z",
}

const list = (items: unknown[], total = items.length) => ({ body: { items, total } })

function stubBank() {
    return stubFetch({
        "GET /portal/auth/me": {
            body: { id: "u1", username: "ada", displayName: "Ada", role: "ADMIN", emailVerified: true, totpEnabled: true, avatarUrl: null },
        },
        "GET /portal/questions?limit=500&bucket=khoi-dong": list([draftRow]),
        "GET /portal/questions/bucket-counts": { body: {} },
        "POST /portal/questions/media": {
            body: { url: "https://cdn.example/anh.png", type: "image" },
        },
        "POST /portal/questions": { body: { id: "q2" } },
        "PATCH /portal/questions/q1/status": { body: { ...draftRow, status: "PENDING" } },
    })
}

describe("QuestionsPage", () => {
    it("lists the bank with kind, status and the draft's actions", async () => {
        stubBank()
        renderWithProviders(<QuestionsPage />)

        expect(await screen.findByText(draftRow.questionText)).toBeInTheDocument()
        const row = screen.getByText(draftRow.questionText).closest("tr")!
        expect(within(row).getByText("TEXT")).toBeInTheDocument()
        expect(within(row).getByText("Draft")).toBeInTheDocument()
        expect(within(row).getByRole("button", { name: /Submit/ })).toBeInTheDocument()
        expect(within(row).getByRole("button", { name: /Archive/ })).toBeInTheDocument()
        expect(within(row).getByRole("button", { name: /Edit/ })).toBeInTheDocument()
        expect(screen.queryByRole("button", { name: /Publish/ })).toBeNull() 
    })

    it("creates a TEXT question: dialog draft becomes the POST payload", async () => {
        const user = userEvent.setup()
        const fetchMock = stubBank()
        renderWithProviders(<QuestionsPage />)

        await user.click(await screen.findByRole("button", { name: /New question/ }))
        const dialog = await screen.findByRole("dialog")

        await user.type(within(dialog).getByLabelText("Question"), "Thủ đô của Việt Nam là?")
        await user.type(within(dialog).getByLabelText(/Accepted answers/), "Hà Nội\nHa Noi")
        await user.selectOptions(within(dialog).getByLabelText("Round group"), "khoi-dong:chung")

        await user.click(within(dialog).getByRole("button", { name: "Save" }))

        const post = fetchMock.mock.calls.find(
            ([url, init]) => url === "/portal/questions" && init?.method === "POST"
        )
        expect(post).toBeTruthy()
        const body = JSON.parse(post![1]?.body as string)
        expect(body).toEqual({
            kind: "TEXT",
            media: null,
            questionText: "Thủ đô của Việt Nam là?",
            payload: {
                type: "TEXT",
                acceptedAnswers: ["Hà Nội", "Ha Noi"],
            },
            tags: ["khoi-dong:chung"],
        })
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    })

    it("uploads media the moment a file is picked, and saves it with the question", async () => {
        const user = userEvent.setup()
        const fetchMock = stubBank()
        renderWithProviders(<QuestionsPage />)

        await user.click(await screen.findByRole("button", { name: /New question/ }))
        const dialog = await screen.findByRole("dialog")

        await user.type(within(dialog).getByLabelText("Question"), "Có hình minh hoạ")
        await user.type(within(dialog).getByLabelText(/Accepted answers/), "Đáp án")
        await user.selectOptions(within(dialog).getByLabelText("Round group"), "khoi-dong:chung")

        await user.upload(
            within(dialog).getByLabelText(/Tải ảnh/),
            new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "anh.png", {
                type: "image/png",
            })
        )

        // uploaded on pick — before any save — so the preview is the stored object
        await waitFor(() =>
            expect(
                fetchMock.mock.calls.some(([url]) => url === "/portal/questions/media")
            ).toBe(true)
        )
        expect(await within(dialog).findByRole("button", { name: /Gỡ media/ })).toBeInTheDocument()

        await user.click(within(dialog).getByRole("button", { name: "Save" }))

        const post = fetchMock.mock.calls.find(
            ([url, init]) => url === "/portal/questions" && init?.method === "POST"
        )
        expect(post).toBeTruthy()
        const body = JSON.parse(post![1]?.body as string)
        expect(body.media).toEqual({ url: "https://cdn.example/anh.png", type: "image" })
    })

    it("shows the server's reason when saving is refused (empty question)", async () => {
        const user = userEvent.setup()
        stubBank()
        renderWithProviders(<QuestionsPage />)

        await user.click(await screen.findByRole("button", { name: /New question/ }))
        const dialog = await screen.findByRole("dialog")

        expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled()
        expect(within(dialog).getByText("Pick the round group this question lives in.")).toBeInTheDocument()
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
        expect(await screen.findByText(draftRow.questionText)).toBeInTheDocument()
    })
})
