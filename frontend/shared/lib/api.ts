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
        // The API's error shape: { error, message, details }. The details carry the
        // specifics the server refused over — the tied players, the unknown rounds.
        public code?: string,
        public details?: string[]
    ) {
        super(message)
        this.name = "ApiError"
    }
}


export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(path, {
        ...init,
        credentials: "include",
        headers: {
            ...(init.body ? { "Content-Type": "application/json" } : {}),
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
        const code =
            body && typeof body === "object" && "error" in body ? String(body.error) : undefined
        const details =
            body && typeof body === "object" && Array.isArray(body.details)
                ? (body.details as string[])
                : undefined
        throw new ApiError(res.status, message, code, details)
    }

    return body as T
}