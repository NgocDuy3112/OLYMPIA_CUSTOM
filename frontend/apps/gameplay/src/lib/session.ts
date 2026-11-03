import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api, ApiError } from "@shared/lib/api"

export const ME_QUERY_KEY = ["me"] as const

interface SessionUser {
    id: string
    username: string | null
    displayName: string
    role: "ADMIN" | "OPERATOR" | "PLAYER"
    emailVerified: boolean
    totpEnabled: boolean
    avatarUrl: string | null
}

export function useMe() {
    return useQuery({
        queryKey: ME_QUERY_KEY,
        queryFn: () => api<SessionUser>("/gameplay/auth/me"),
        // A signed-out player is the common case on a public surface — 401 is an
        // answer, never a retry.
        retry: false,
        staleTime: 5 * 60_000,
    })
}

export function isUnauthorized(error: unknown): boolean {
    return error instanceof ApiError && error.status === 401
}

/**
 * Google's door, for a player who HAS a Google account and wants to keep their
 * history. The PIN is the real one — an operator creates the identities, so a
 * player never has to sign in at all (`/join`).
 */
export function loginLink(next: string): string {
    return `/gameplay/auth/google?next=${encodeURIComponent(next)}`
}

/** What this deployment lets a player sign in with. Google is optional. */
interface AuthMethods {
    pin: boolean
    google: boolean
}

export function useAuthMethods() {
    return useQuery({
        queryKey: ["auth-methods"],
        queryFn: () => api<AuthMethods>("/gameplay/auth/methods"),
        // Deployment config, not player state: it cannot change mid-session.
        staleTime: 30 * 60_000,
        retry: false,
    })
}

export function useLogout() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: () => api<{ ok: true }>("/gameplay/auth/logout", { method: "POST" }),
        onSuccess: () => {
            queryClient.setQueryData(ME_QUERY_KEY, null)
        },
    })
}
