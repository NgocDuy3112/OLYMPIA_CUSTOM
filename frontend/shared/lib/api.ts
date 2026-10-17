export class ApiError extends Error {
    constructor(public status: number, message: string) {
        super(message)
        this.name = "ApiError"
    }
}

// Same-origin in dev — Vite proxies /portal to the backend — so the httpOnly
// session cookie rides along automatically and there's no CORS preflight.
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
        throw new ApiError(res.status, message)
    }

    return body as T
}