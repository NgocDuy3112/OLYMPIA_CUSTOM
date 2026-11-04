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
 * The player's own door: email + password they chose when they registered.
 * Google is the secondary link, offered only when the deployment configured it.
 */
export function loginLink(next?: string): string {
    const suffix = next ? `?next=${encodeURIComponent(next)}` : ""
    return `/login${suffix}`
}

export function registerLink(): string {
    return "/register"
}

/** Google's door — only worth rendering when `useAuthMethods().google`. */
export function googleLoginLink(next?: string): string {
    return `/gameplay/auth/google?next=${encodeURIComponent(next ?? "/")}`
}

/** What this deployment lets a player sign in with. Google is optional. */
interface AuthMethods {
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

/**
 * Sign in. On success the session cookie exists but EVERYTHING cached was read
 * without it — the `me` query above most of all, which is what puts the player's
 * name in the navbar.
 */
export function useLogin() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (input: { email: string; password: string }) =>
            api<{ id: string; displayName: string; email: string }>("/gameplay/auth/login", {
                method: "POST",
                body: JSON.stringify(input),
            }),
        onSuccess: () => {
            void queryClient.invalidateQueries()
        },
    })
}

/**
 * Register: creates an UNVERIFIED account and mails the link. No session is
 * minted — the success screen says to go read the mail, nothing else.
 */
export function useRegister() {
    return useMutation({
        mutationFn: (input: { email: string; password: string; displayName?: string }) =>
            api<{ pendingVerification: true; to: string }>("/gameplay/auth/register", {
                method: "POST",
                body: JSON.stringify(input),
            }),
    })
}

/** One match the player is seated in — what "Vào trận" opens. */
export interface MyMatch {
    matchId: string
    label: string
    status: "UPCOMING" | "LIVE" | "FINISHED"
    scheduledAt: string
    slug: string
    tournamentName: string
}

/**
 * The matches this player has a seat in (UPCOMING or LIVE, newest first).
 * A signed-out player gets a 401 — an answer, never a retry.
 */
export function useMyMatches(options: { enabled: boolean } = { enabled: true }) {
    return useQuery({
        queryKey: ["my-matches"],
        queryFn: () => api<{ items: MyMatch[] }>("/gameplay/me/match"),
        enabled: options.enabled,
        retry: false,
        staleTime: 30_000,
    })
}
