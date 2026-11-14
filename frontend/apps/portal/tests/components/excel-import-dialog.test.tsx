import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { ExcelImportDialog } from "@/components/excel-import-dialog"
import { renderWithProviders } from "../helpers/render"


const workbook = new File(["PK…"], "cau-hoi.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
})

const report = (over: Record<string, unknown> = {}) => ({
    dryRun: true,
    total: 2,
    created: 0,
    ids: [],
    errors: [],
    skipped: 0,
    warnings: [],
    rows: [
        { index: 0, sheet: "Khởi động", sourceId: "KD-1", bucket: "khoi-dong:chung", kind: "TEXT" },
        { index: 1, sheet: "Bứt phá", sourceId: "BP-1", bucket: "but-pha", kind: "TEXT" },
    ],
    ...over,
})

const callKey = (call: [RequestInfo | URL, RequestInit?]) =>
    `${call[1]?.method ?? "GET"} ${String(call[0])}`

const callOf = (fetchMock: ReturnType<typeof renderWithProviders>["fetchMock"], key: string) =>
    fetchMock?.mock.calls.find((call) => callKey(call) === key)

const upload = async () => {
    await userEvent.upload(screen.getByLabelText("Bundle (.zip or .xlsx)"), workbook)
    await userEvent.click(screen.getByRole("button", { name: "Validate (dry run)" }))
    await screen.findByText(/2 questions valid/)
}

describe("ExcelImportDialog — the bank's upload", () => {
    it("validates first, then imports WITHOUT staging (straight to the bank)", async () => {
        const onClose = vi.fn()
        const { fetchMock } = renderWithProviders(
            <ExcelImportDialog open onClose={onClose} />,
            {
                routes: {
                    "POST /portal/questions/import-excel?dryRun=true": { body: report() },
                    "POST /portal/questions/import-excel?dryRun=false": {
                        body: report({ dryRun: false, created: 2, ids: ["q1", "q2"] }),
                    },
                },
            }
        )

        await upload()
        expect(callOf(fetchMock, "POST /portal/questions/import-excel?dryRun=true")).toBeTruthy()

        await userEvent.click(screen.getByRole("button", { name: "Import" }))

        await waitFor(() =>
            expect(callOf(fetchMock, "POST /portal/questions/import-excel?dryRun=false")).toBeTruthy()
        )
        expect(onClose).toHaveBeenCalled()
    })
})

describe("ExcelImportDialog — the match's upload", () => {
    it("stages the rows, then commits them into THAT match", async () => {
        const onClose = vi.fn()
        const onDone = vi.fn()
        const { fetchMock } = renderWithProviders(
            <ExcelImportDialog
                open
                onClose={onClose}
                commitTo={{ tournamentId: "t1", matchId: "m1", onDone }}
            />,
            {
                routes: {
                    "POST /portal/questions/import-excel?dryRun=true": { body: report() },
                    "POST /portal/questions/import-excel?dryRun=false&stage=true": {
                        body: report({ dryRun: false, stagedBatchId: "b1" }),
                    },
                    "POST /portal/question-imports/b1/commit-to-match": {
                        body: { created: 2, ids: ["q1", "q2"], errors: [], assemblyRevision: 7 },
                    },
                },
            }
        )

        await upload()
        await userEvent.click(screen.getByRole("button", { name: "Nhập vào trận" }))

        const staged = await waitFor(() =>
            callOf(fetchMock, "POST /portal/questions/import-excel?dryRun=false&stage=true")
        )
        expect(staged).toBeTruthy()

        const commit = await waitFor(() =>
            callOf(fetchMock, "POST /portal/question-imports/b1/commit-to-match")
        )
        expect(JSON.parse(String(commit![1]?.body))).toEqual({ tournamentId: "t1", matchId: "m1" })

        await waitFor(() => expect(onDone).toHaveBeenCalledWith(2, 7))
        expect(onClose).toHaveBeenCalled()
    })

    it("keeps the batch (and says so) when the commit is refused", async () => {
        const onClose = vi.fn()
        const onDone = vi.fn()
        const { fetchMock } = renderWithProviders(
            <ExcelImportDialog
                open
                onClose={onClose}
                commitTo={{ tournamentId: "t1", matchId: "m1", onDone }}
            />,
            {
                routes: {
                    "POST /portal/questions/import-excel?dryRun=true": { body: report() },
                    "POST /portal/questions/import-excel?dryRun=false&stage=true": {
                        body: report({ dryRun: false, stagedBatchId: "b2" }),
                    },
                    "POST /portal/question-imports/b2/commit-to-match": {
                        body: { message: "3 rows still need fixing" },
                        status: 422,
                    },
                },
            }
        )

        await upload()
        await userEvent.click(screen.getByRole("button", { name: "Nhập vào trận" }))

        expect(await screen.findByRole("alert")).toHaveTextContent(/3 rows still need fixing/)
        expect(screen.getByRole("alert")).toHaveTextContent(/trang Ngân hàng/)
        expect(onDone).not.toHaveBeenCalled()
        expect(fetchMock).toBeTruthy()
    })
})
