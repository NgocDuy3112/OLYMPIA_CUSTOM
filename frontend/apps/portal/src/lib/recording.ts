import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "@shared/lib/api"


export interface RecordingRow {
    id: string
    matchId: string
    egressId: string | null
    status: "RECORDING" | "STOPPED" | "FAILED"
    s3Key: string | null
    startedBy: string | null
    startedAt: string
    stoppedAt: string | null
    error: string | null
    url: string | null
}

interface RecordingList {
    items: RecordingRow[]
}

const recordingKey = (matchId: string) => ["recording", matchId] as const


// The toolbar's Ghi hình state. Polls while a segment is still running (the
// finalizer flips it to STOPPED/FAILED asynchronously after the stop) and
// goes quiet once everything is terminal — the server also reconciles stale
// rows on each read, so a crashed egress heals on the next poll.
export function useRecording(tournamentId: string, matchId: string) {
    return useQuery({
        queryKey: recordingKey(matchId),
        queryFn: () =>
            api<RecordingList>(
                `/portal/tournaments/${tournamentId}/matches/${matchId}/recording`
            ),
        refetchInterval: (query) =>
            query.state.data?.items.some((row) => row.status === "RECORDING")
                ? 3_000
                : false,
        placeholderData: (previous) => previous,
        retry: false,
        staleTime: 0,
    })
}


export function useStartRecording(tournamentId: string, matchId: string) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: () =>
            api<{ recording: RecordingRow }>(
                `/portal/tournaments/${tournamentId}/matches/${matchId}/recording/start`,
                { method: "POST" }
            ),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: recordingKey(matchId) })
        },
    })
}


export function useStopRecording(tournamentId: string, matchId: string) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: () =>
            api<{ recording: RecordingRow; egressStatus: string | null }>(
                `/portal/tournaments/${tournamentId}/matches/${matchId}/recording/stop`,
                { method: "POST" }
            ),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: recordingKey(matchId) })
        },
    })
}
