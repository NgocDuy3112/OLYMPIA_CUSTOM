import { useQuery } from "@tanstack/react-query"
import { api } from "@shared/lib/api"
import type { ContestantRow } from "@shared/wire/tournament"
import { queryKeys } from "./keys"

export function useEnrolled(tournamentId: string) {
    return useQuery({
        queryKey: queryKeys.enrolled(tournamentId),
        queryFn: () =>
            api<{ items: ContestantRow[] }>(`/portal/tournaments/${tournamentId}/players`),
        enabled: Boolean(tournamentId),
    })
}
