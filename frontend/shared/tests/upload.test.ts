import { afterEach, describe, expect, it, vi } from "vitest"
import { ApiError, UploadError, uploadWithProgress } from "../lib/api"

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

const file = new File(["PK…"], "de.xlsx")
const progressOf = (loaded: number, total: number) =>
    ({ lengthComputable: true, loaded, total }) as unknown as ProgressEvent

function upload() {
    FakeXHR.instances = []
    vi.stubGlobal("XMLHttpRequest", FakeXHR)
    const onProgress = vi.fn()
    const result = uploadWithProgress("/import", file, onProgress)
    return { xhr: FakeXHR.instances[0], onProgress, result }
}

afterEach(() => {
    vi.unstubAllGlobals()
})

describe("uploadWithProgress — one XHR wrapper that keeps ApiError semantics", () => {
    it("reports percent and processing, then resolves the typed report", async () => {
        const { xhr, onProgress, result } = upload()
        expect(xhr.method).toBe("POST")
        expect(xhr.withCredentials).toBe(true)
        expect((xhr.sent as FormData).get("file")).toBeInstanceOf(File)

        xhr.upload.onprogress?.(progressOf(50, 100))
        expect(onProgress).toHaveBeenCalledWith({ percent: 50, processing: false })

        xhr.upload.onload?.()
        expect(onProgress).toHaveBeenCalledWith({ percent: 100, processing: true })

        xhr.status = 200
        xhr.responseText = JSON.stringify({ created: 2, assemblyRevision: 7 })
        xhr.onload?.()

        await expect(result).resolves.toEqual({ created: 2, assemblyRevision: 7 })
    })

    it("rejects a refusal with status, message and typed row errors", async () => {
        const { xhr, result } = upload()
        xhr.status = 400
        xhr.responseText = JSON.stringify({
            message: "File có 2 dòng lỗi.",
            details: [{ index: 3, message: "Thiếu đáp án" }],
        })
        xhr.onload?.()

        const error = await result.catch((failure: unknown) => failure)
        expect(error).toBeInstanceOf(UploadError)
        expect(error).toMatchObject({
            status: 400,
            message: "File có 2 dòng lỗi.",
            rows: [{ index: 3, message: "Thiếu đáp án" }],
        })
    })

    it("rejects a transport failure as an ApiError without a server status", async () => {
        const { xhr, result } = upload()
        xhr.onerror?.()

        const error = await result.catch((failure: unknown) => failure)
        expect(error).toBeInstanceOf(ApiError)
        expect((error as ApiError).status).toBe(0)
    })
})
