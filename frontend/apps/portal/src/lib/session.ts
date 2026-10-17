import { useQuery } from "@tanstack/react-query"
import { api, ApiError } from "@shared/lib/api"

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
        queryKey: ["me"],
        queryFn: () => api<SessionUser>("/portal/auth/me"),
        retry: false,
        staleTime: 5 * 60_000,
    })
}


export function isUnauthorized(error: unknown): boolean {
    return error instanceof ApiError && error.status === 401
}