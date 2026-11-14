import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "@shared/lib/api"

/** One tournament a player sits in — shown as badges on the global list. */
export interface PlayerEnrollment {
    tournamentId: string
    name: string
    current: boolean
    closed: boolean
}

/** Every PLAYER account in the system. Players land here by signing in with
 *  Google; the desk assigns tournaments afterwards. */
export interface PlayerRow {
    userId: string
    displayName: string
    username: string
    email: string | null
    discordId: string | null
    enrollments: PlayerEnrollment[]
}

export function usePlayers() {
    return useQuery({
        queryKey: ["players"],
        queryFn: () => api<{ items: PlayerRow[] }>("/portal/players"),
    })
}

/** Edits the account (name / email / Discord) — no tournament involved. */
export function useUpdatePlayer() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (edit: {
            userId: string
            displayName?: string
            email?: string | null
            discordId?: string | null
        }) =>
            api<{ userId: string; displayName: string; email: string | null }>(
                `/portal/players/${edit.userId}`,
                {
                    method: "PATCH",
                    body: JSON.stringify({
                        ...(edit.displayName !== undefined ? { displayName: edit.displayName } : {}),
                        ...(edit.email !== undefined ? { email: edit.email } : {}),
                        ...(edit.discordId !== undefined ? { discordId: edit.discordId } : {}),
                    }),
                }
            ),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ["players"] })
            void queryClient.invalidateQueries({ queryKey: ["enrolled"] })
        },
    })
}

/** Membership is per tournament: this is the row's "Ghi danh vào giải…". */
export function useEnrollIntoTournament() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (input: { tournamentId: string; userIds: string[] }) =>
            api<{ enrolled: number }>(`/portal/tournaments/${input.tournamentId}/players`, {
                method: "POST",
                body: JSON.stringify({ userIds: input.userIds }),
            }),
        onSuccess: (_result, input) => {
            void queryClient.invalidateQueries({ queryKey: ["players"] })
            void queryClient.invalidateQueries({ queryKey: ["enrolled", input.tournamentId] })
            void queryClient.invalidateQueries({ queryKey: ["groups", input.tournamentId] })
        },
    })
}

/** …and this is the row's "Bỏ khỏi giải…". */
export function useRemoveFromTournament() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (input: { tournamentId: string; userId: string }) =>
            api<{ removed: string }>(
                `/portal/tournaments/${input.tournamentId}/players/${input.userId}`,
                { method: "DELETE" }
            ),
        onSuccess: (_result, input) => {
            void queryClient.invalidateQueries({ queryKey: ["players"] })
            void queryClient.invalidateQueries({ queryKey: ["enrolled", input.tournamentId] })
            void queryClient.invalidateQueries({ queryKey: ["groups", input.tournamentId] })
        },
    })
}
