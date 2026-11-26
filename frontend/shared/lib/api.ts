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


export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
    const method = init.method ?? "GET"
    try {
        return await apiInner<T>(path, init)
    } catch (error) {
        const detail = messageOf(error)
        logError("api", `${method} ${path} → ${detail}`)
        throw error
    }
}

function messageOf(error: unknown): string {
    if (error instanceof Error) return error.message
    return String(error)
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
