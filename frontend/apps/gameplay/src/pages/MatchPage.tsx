import type { TournamentRound } from "@/lib/api"
import type { Match } from "@/lib/types"
import { MatchDetail } from "@/components/schedule/MatchDetail"

interface MatchPageProps {
    match: Match
    rounds: TournamentRound[]
    onBack: () => void
}

// The route found the match; this page only renders it.
export function MatchPage({ match, rounds, onBack }: MatchPageProps) {
    return (
        <MatchDetail
            match={match}
            rounds={rounds}
            onBack={onBack}
        />
    )
}
