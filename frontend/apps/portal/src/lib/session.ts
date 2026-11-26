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
        queryFn: () => api<SessionUser>("/portal/auth/me"),
        retry: false,
        staleTime: 5 * 60_000,
    })
}


export function useLogout() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: () => api<{ ok: true }>("/portal/auth/logout", { method: "POST" }),
        onSuccess: () => {
            queryClient.setQueryData(ME_QUERY_KEY, null)
        },
    })
}

export function isUnauthorized(error: unknown): boolean {
    return error instanceof ApiError && error.status === 401
}