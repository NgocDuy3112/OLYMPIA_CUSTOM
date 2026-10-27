import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api, ApiError } from "@shared/lib/api"

export const ME_QUERY_KEY = ["me"] as const

export interface SessionUser {
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

// The whole login flow is one link: Google, then ?next= brings the player back.
export function loginLink(next: string): string {
    return `/gameplay/auth/google?next=${encodeURIComponent(next)}`
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
