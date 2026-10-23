import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api, ApiError } from "@shared/lib/api"
import type { QualificationView, ViewFailure } from "./qualification-state"

// The player's qualification API. Push-first: this query is fetched ONCE on mount
// and refetched only (a) after the player's own submit or (b) when the socket
// signals (see ./qualification-socket). staleTime: Infinity means react-query's
// own refetch triggers (focus, mount) stay silent — the signal channel is the
// only thing that moves the view.

export const qualificationKey = (matchId: string) => ["qualification", matchId] as const

export function useQualification(matchId: string, enabled: boolean) {
    return useQuery({
        queryKey: qualificationKey(matchId),
        queryFn: () =>
            api<QualificationView>(`/gameplay/matches/${matchId}/qualification`),
        enabled: enabled && Boolean(matchId),
        // 401/403/409 are answers, not failures to retry through.
        retry: false,
        staleTime: Infinity,
    })
}

// ApiError → the shape the state machine reads. A non-API error becomes a
// status-0 failure so it lands in the "say why" branch, never in a gate.
export function failureOf(error: unknown): ViewFailure | null {
    if (!error) return null
    if (error instanceof ApiError) {
        return { status: error.status, code: error.code, message: error.message }
    }
    return {
        status: 0,
        message: error instanceof Error ? error.message : "Không tải được sự kiện.",
    }
}

// One attempt per question, enforced server-side. Both ways of losing the race
// (double submit → ALREADY_ANSWERED, staff advanced → CLOSED) end as a 409 —
// in both cases the VIEW is right and we refetch to see it.
export function useSubmitAnswer(matchId: string) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (input: { questionId: string; value: { picked?: string[]; text?: string } }) =>
            api<{ verdict: "CORRECT" | "INCORRECT" }>(
                `/gameplay/matches/${matchId}/qualification/answers`,
                { method: "POST", body: JSON.stringify(input) }
            ),
        onSuccess: () => {
            // The player's own submit: the one refetch they are allowed to cause.
            void queryClient.invalidateQueries({ queryKey: qualificationKey(matchId) })
        },
        onError: (error) => {
            if (error instanceof ApiError && error.status === 409) {
                void queryClient.invalidateQueries({ queryKey: qualificationKey(matchId) })
            }
        },
    })
}
