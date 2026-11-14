import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "@shared/lib/api"

export interface PlayerEnrollment {
    tournamentId: string
    name: string
    current: boolean
    closed: boolean
}

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
