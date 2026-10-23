import { type ReactNode } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { Badge } from "@shared/ui/badge"
import { Button } from "@shared/ui/button"
import { useMatches } from "@/lib/tournament"
import { MassEventControl } from "@/components/mass-event-control"
import { StandardMatchControl } from "@/components/standard-match-control"

// The match's own page — every match operation lives HERE, not in dialogs
// (recorded decision, 2310: running a match is a task with its own flow).
//
//   QUALIFICATION → the mass event's control room (open / advance / live count /
//                   current question / field / close / ranking)
//   STANDARD      → identity + assembly state + Start transition + result entry
//
// Route: /tournaments/:tournamentId/matches/:matchId

export function MatchPage() {
    const { tournamentId, matchId } = useParams()
    const navigate = useNavigate()
    const matches = useMatches(tournamentId ?? "")
    const back = `/tournaments/${tournamentId}`

    if (matches.isPending) {
        return (
            <Shell onBack={() => navigate(back)}>
                <div role="status" aria-label="Loading match" className="h-64 animate-pulse rounded-xl bg-muted" />
            </Shell>
        )
    }

    if (matches.isError) {
        return (
            <Shell onBack={() => navigate(back)}>
                <p role="alert" className="text-sm text-destructive">{matches.error.message}</p>
            </Shell>
        )
    }

    const match = matches.data.items.find((row) => row.id === matchId)
    if (!match) {
        return (
            <Shell onBack={() => navigate(back)}>
                <p className="text-sm text-muted-foreground">Match not found — it may have been deleted.</p>
            </Shell>
        )
    }

    return (
        <Shell
            onBack={() => navigate(back)}
            title={match.label}
            badges={
                <>
                    <Badge variant={match.status === "FINISHED" ? "secondary" : match.status === "LIVE" ? "destructive" : "outline"}>
                        {match.status}
                    </Badge>
                    <Badge variant="outline">{match.kind === "QUALIFICATION" ? "Mass event" : "Points match"}</Badge>
                </>
            }
        >
            {match.kind === "QUALIFICATION" ? (
                <MassEventControl
                    tournamentId={tournamentId!}
                    matchId={match.id}
                    seats={match.players.length || 4}
                />
            ) : (
                <StandardMatchControl tournamentId={tournamentId!} match={match} />
            )}
        </Shell>
    )
}

function Shell({
    onBack,
    title,
    badges,
    children,
}: {
    onBack: () => void
    title?: string
    badges?: ReactNode
    children: ReactNode
}) {
    return (
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 md:py-8">
            <div className="flex flex-wrap items-center gap-3">
                <Button variant="ghost" size="sm" onClick={onBack} aria-label={`Back to tournament`}>
                    ◀
                </Button>
                {title && <h1 className="font-heading text-2xl font-semibold">{title}</h1>}
                {badges}
            </div>
            {children}
        </div>
    )
}
