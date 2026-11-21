import { act, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { MatchDirectImportDialog } from "@/components/match-direct-import-dialog"
import { renderWithProviders } from "../helpers/render"

class FakeUpload {
    onprogress: ((event: ProgressEvent) => void) | null = null
    onload: (() => void) | null = null
}

class FakeXHR {
    static instances: FakeXHR[] = []
    upload = new FakeUpload()
    onload: (() => void) | null = null
    onerror: (() => void) | null = null
    onabort: (() => void) | null = null
    withCredentials = false
    method = ""
    url = ""
    status = 0
    responseText = ""
    sent: unknown = null

    constructor() {
        FakeXHR.instances.push(this)
    }

    open(method: string, url: string) {
        this.method = method
        this.url = url
    }

    send(body: unknown) {
        this.sent = body
    }

    abort() {
    }
}

const workbook = new File(["PK…"], "de.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
})

const progressOf = (loaded: number, total: number) =>
    ({ lengthComputable: true, loaded, total }) as unknown as ProgressEvent

function setup() {
    FakeXHR.instances = []
    vi.stubGlobal("XMLHttpRequest", FakeXHR)
    const onClose = vi.fn()
    const onDone = vi.fn()
    renderWithProviders(
        <MatchDirectImportDialog
            open
            onClose={onClose}
            tournamentId="t1"
            matchId="m1"
            onDone={onDone}
        />
    )
    return { onClose, onDone }
}

async function pickAndSend() {
    await userEvent.upload(screen.getByLabelText("File đề (.xlsx hoặc .zip)"), workbook)
    await userEvent.click(screen.getByRole("button", { name: "Tải lên" }))
    expect(FakeXHR.instances).toHaveLength(1)
    return FakeXHR.instances[0]
}

afterEach(() => {
    vi.unstubAllGlobals()
})

describe("MatchDirectImportDialog", () => {
    it("disables upload until a file is picked", () => {
        setup()
        expect(screen.getByRole("button", { name: "Tải lên" })).toBeDisabled()
    })

    it("posts the file with XHR credentials and moves the progress bar", async () => {
        setup()
        const xhr = await pickAndSend()

        expect(xhr.method).toBe("POST")
        expect(xhr.url).toBe("/portal/tournaments/t1/matches/m1/questions/import")
        expect(xhr.withCredentials).toBe(true)
        const sent = xhr.sent as FormData
        expect((sent.get("file") as File).name).toBe("de.xlsx")

        act(() => {
            xhr.upload.onprogress?.(progressOf(50, 100))
        })
        expect(screen.getByRole("progressbar")).toBeInTheDocument()
        expect(screen.getByText("50% đã tải")).toBeInTheDocument()

        act(() => {
            xhr.upload.onload?.()
        })
        expect(screen.getByText("Đang xử lý…")).toBeInTheDocument()
    })

    it("renders every row error when the server rejects the file", async () => {
        setup()
        const xhr = await pickAndSend()

        xhr.status = 400
        xhr.responseText = JSON.stringify({
            statusCode: 400,
            error: "Bad Request",
            message: "File có 2 dòng lỗi.",
            details: [
                { index: 3, message: "Thiếu đáp án" },
                { index: 7, message: "Sai nhóm" },
            ],
        })
        act(() => {
            xhr.onload?.()
        })

        expect(await screen.findByRole("alert")).toHaveTextContent("File có 2 dòng lỗi.")
        expect(screen.getByText("dòng 3: Thiếu đáp án")).toBeInTheDocument()
        expect(screen.getByText("dòng 7: Sai nhóm")).toBeInTheDocument()
    })

    it("reports the count, notifies the parent and closes on success", async () => {
        const { onClose, onDone } = setup()
        const xhr = await pickAndSend()

        xhr.status = 200
        xhr.responseText = JSON.stringify({ created: 2, assemblyRevision: 7 })
        act(() => {
            xhr.onload?.()
        })

        await waitFor(() => expect(onDone).toHaveBeenCalledWith(2, 7))
        expect(onClose).toHaveBeenCalled()
        expect(screen.getByText("Đã nhập 2 câu vào trận.")).toBeInTheDocument()
    })

    it("tells upload failures apart from server rejections", async () => {
        setup()
        const xhr = await pickAndSend()

        act(() => {
            xhr.onerror?.()
        })
        expect(await screen.findByRole("alert")).toHaveTextContent(/Không tải được file/)
    })

    it("tells an aborted upload apart from server rejections", async () => {
        setup()
        const xhr = await pickAndSend()

        act(() => {
            xhr.onabort?.()
        })
        expect(await screen.findByRole("alert")).toHaveTextContent(/Đã hủy tải lên/)
    })
})
