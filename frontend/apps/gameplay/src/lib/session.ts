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
        retry: false,
        staleTime: 5 * 60_000,
    })
}

export function isUnauthorized(error: unknown): boolean {
    return error instanceof ApiError && error.status === 401
}

export function loginLink(next?: string): string {
    const suffix = next ? `?next=${encodeURIComponent(next)}` : ""
    return `/login${suffix}`
}

export function googleLoginLink(next?: string): string {
    return `/gameplay/auth/google?next=${encodeURIComponent(next ?? "/")}`
}

interface AuthMethods {
    google: boolean
}

export function useAuthMethods() {
    return useQuery({
        queryKey: ["auth-methods"],
        queryFn: () => api<AuthMethods>("/gameplay/auth/methods"),
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

export function useLogin() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (input: { username: string; password: string }) =>
            api<{ id: string; username: string; displayName: string; mustChangePassword: boolean }>(
                "/gameplay/auth/login",
                {
                    method: "POST",
                    body: JSON.stringify(input),
                }
            ),
        onSuccess: () => {
            void queryClient.invalidateQueries()
        },
    })
}

export function useChangePassword() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (input: { currentPassword: string; newPassword: string }) =>
            api<{ ok: true; displayName: string }>("/gameplay/auth/change-password", {
                method: "POST",
                body: JSON.stringify(input),
            }),
        onSuccess: () => {
            void queryClient.invalidateQueries()
        },
    })
}

export interface MyMatch {
    matchId: string
    label: string
    status: "UPCOMING" | "LIVE" | "FINISHED"
    scheduledAt: string
    slug: string
    tournamentName: string
}

export function useClaimCode() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (code: string) =>
            api<{ matchId: string; slug: string; label: string }>("/gameplay/join/claim", {
                method: "POST",
                body: JSON.stringify({ code }),
            }),
        onSuccess: () => {
            void queryClient.invalidateQueries()
        },
    })
}

export function useMyMatches(options: { enabled: boolean } = { enabled: true }) {
    return useQuery({
        queryKey: ["my-matches"],
        queryFn: () => api<{ items: MyMatch[] }>("/gameplay/me/match"),
        enabled: options.enabled,
        retry: false,
        staleTime: 30_000,
    })
}
