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
 * The player's own door: the handle the desk issued, and the password they
 * chose at their first sign-in. Google is the secondary link, offered only when
 * the deployment configured it.
 */
export function loginLink(next?: string): string {
    const suffix = next ? `?next=${encodeURIComponent(next)}` : ""
    return `/login${suffix}`
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
 * Sign in with the handle the desk issued. On success the session cookie exists
 * but EVERYTHING cached was read without it — the `me` query above most of all,
 * which is what puts the player's name in the navbar.
 *
 * `mustChangePassword` says the desk's first password is still in place: the
 * caller sends the player to /password instead of wherever they were going —
 * and the API gate would send them there on the next request anyway.
 */
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

/**
 * Set my OWN password — the door the forced change walks through. The response
 * re-issues this browser's session (the one the desk's password minted dies with
 * the tokenVersion bump), so the player carries straight on instead of logging
 * in again with a password they typed ten seconds ago.
 */
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
 * Claim a seat with the room code the desk handed out — session + code, never
 * code alone (the code says WHICH room, the account says WHO). The answer is
 * the match they are now seated in: 401 means the session is gone, 404 an
 * unknown or expired code, 409 a full table. The server's own message is what
 * the page shows.
 */
export function useClaimCode() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (code: string) =>
            api<{ matchId: string; slug: string; label: string }>("/gameplay/join/claim", {
                method: "POST",
                body: JSON.stringify({ code }),
            }),
        onSuccess: () => {
            // The seat is new: "which match am I in" was read without it.
            void queryClient.invalidateQueries()
        },
    })
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
