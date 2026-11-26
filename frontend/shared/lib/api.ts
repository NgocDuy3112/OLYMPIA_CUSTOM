import { errorMessage } from "./error-text"
import { logError } from "./log"

export interface PageResult<T> {
    items: T[]
    total: number
    limit: number
    offset: number
}


export class ApiError extends Error {
    constructor(
        public status: number,
        message: string,
        public code?: string,
        public details?: string[],
        public body?: unknown
    ) {
        super(message)
        this.name = "ApiError"
    }
}


export interface UploadProgress {
    percent: number
    processing: boolean
}

export interface UploadReport {
    created: number
    assemblyRevision: number
}

export interface UploadRowError {
    index: number
    message: string
}

export class UploadError extends ApiError {
    constructor(status: number, message: string, public rows: UploadRowError[]) {
        super(status, message)
        this.name = "UploadError"
    }
}

function objectOf(text: string): Record<string, unknown> | null {
    try {
        const parsed: unknown = JSON.parse(text)
        if (parsed === null || typeof parsed !== "object") return null
        return parsed as Record<string, unknown>
    } catch {
        return null
    }
}

function uploadRowsOf(body: Record<string, unknown> | null): UploadRowError[] {
    if (body === null || Array.isArray(body.details) === false) return []
    return body.details.flatMap((item) => {
        if (item === null || typeof item !== "object") return []
        const row = item as Record<string, unknown>
        if (typeof row.index !== "number" || typeof row.message !== "string") return []
        return [{ index: row.index, message: row.message }]
    })
}

function uploadMessageOf(body: Record<string, unknown> | null): string {
    if (body !== null && typeof body.message === "string" && body.message.length > 0) {
        return body.message
    }
    return "Máy chủ từ chối file — thử lại."
}

function uploadReportOf(body: Record<string, unknown> | null): UploadReport {
    let created = 0
    let assemblyRevision = 0
    if (body !== null) {
        if (typeof body.created === "number") created = body.created
        if (typeof body.assemblyRevision === "number") assemblyRevision = body.assemblyRevision
    }
    return { created, assemblyRevision }
}

export function uploadWithProgress(
    url: string,
    file: File,
    onProgress: (progress: UploadProgress) => void,
    signal?: AbortSignal
): Promise<UploadReport> {
    return new Promise<UploadReport>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open("POST", url)
        xhr.withCredentials = true
        xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
                onProgress({
                    percent: Math.round((event.loaded / event.total) * 100),
                    processing: false,
                })
            }
        }
        xhr.upload.onload = () => onProgress({ percent: 100, processing: true })
        xhr.onload = () => {
            const body = objectOf(xhr.responseText)
            if (xhr.status >= 200 && xhr.status < 300) {
                resolve(uploadReportOf(body))
                return
            }
            reject(new UploadError(xhr.status, uploadMessageOf(body), uploadRowsOf(body)))
        }
        xhr.onerror = () =>
            reject(new ApiError(0, "Không tải được file — kiểm tra mạng và thử lại."))
        xhr.onabort = () => reject(new ApiError(0, "Đã hủy tải lên."))
        signal?.addEventListener("abort", () => xhr.abort())
        const form = new FormData()
        form.append("file", file, file.name)
        xhr.send(form)
    })
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
    const method = init.method ?? "GET"
    try {
        return await apiInner<T>(path, init)
    } catch (error) {
        const detail = errorMessage(error)
        logError("api", `${method} ${path} → ${detail}`)
        throw error
    }
}

async function apiInner<T>(path: string, init: RequestInit): Promise<T> {
    let jsonHeaders: Record<string, string> = {}
    if (init.body) {
        if (!(init.body instanceof FormData)) jsonHeaders = { "Content-Type": "application/json" }
    }
    const res = await fetch(path, {
        ...init,
        credentials: "include",
        headers: {
            ...jsonHeaders,
            ...(init.headers ?? {}),
        },
    })

    if (res.status === 204) return undefined as T

    const body = await res.json().catch(() => null)

    if (!res.ok) {
        const message =
            (body && typeof body === "object" && "message" in body && String(body.message)) ||
            res.statusText ||
            `Request failed (${res.status})`
        let code: string | undefined
        let details: string[] | undefined
        if (body) {
            if (typeof body === "object") {
                if ("error" in body) code = String(body.error)
                if (Array.isArray(body.details)) details = body.details as string[]
            }
        }

        if (code === "PASSWORD_CHANGE_REQUIRED" && typeof window !== "undefined") {
            const at = window.location.pathname
            if (at !== "/password") {
                const back = `${window.location.pathname}${window.location.search}`
                window.location.assign(`/password?next=${encodeURIComponent(back)}`)
            }
        }

        throw new ApiError(res.status, message, code, details, body)
    }

    return body as T
}
