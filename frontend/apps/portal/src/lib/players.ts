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
        }) => {
            const patch: { displayName?: string; email?: string | null; discordId?: string | null } = {}
            if (edit.displayName !== undefined) patch.displayName = edit.displayName
            if (edit.email !== undefined) patch.email = edit.email
            if (edit.discordId !== undefined) patch.discordId = edit.discordId
            return api<{ userId: string; displayName: string; email: string | null }>(
                `/portal/players/${edit.userId}`,
                {
                    method: "PATCH",
                    body: JSON.stringify(patch),
                }
            )
        },
        onMutate: async (edit) => {
            await queryClient.cancelQueries({ queryKey: ["players"] })
            const previous = queryClient.getQueryData<{ items: PlayerRow[] }>(["players"])
            if (previous) {
                queryClient.setQueryData<{ items: PlayerRow[] }>(["players"], {
                    ...previous,
                    items: previous.items.map((row) => {
                        if (row.userId !== edit.userId) return row
                        const next = { ...row }
                        if (edit.displayName !== undefined) next.displayName = edit.displayName
                        if (edit.email !== undefined) next.email = edit.email
                        if (edit.discordId !== undefined) next.discordId = edit.discordId
                        return next
                    }),
                })
            }
            return { previous }
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ["players"] })
            void queryClient.invalidateQueries({ queryKey: ["enrolled"] })
        },
        onError: (_cause, _edit, context) => {
            if (context?.previous) queryClient.setQueryData(["players"], context.previous)
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
