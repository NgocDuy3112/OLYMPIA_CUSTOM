import { Link, useParams } from "react-router-dom"
import { Badge } from "@shared/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@shared/ui/tabs"
import { Page, PageHeader } from "@/components/page"
import { useTournament } from "@/lib/tournament"
import { MatchesTab } from "@/components/matches-tab"
import { TournamentPointsCard } from "@/components/tournament-points-card"
import { TournamentRulesTab } from "@/components/tournament-rules-tab"
import { StagesTab } from "@/components/stages-tab"
import { StandingsTab } from "@/components/standings-tab"
import { ChevronRight } from "lucide-react"


export function TournamentDetailPage() {
    const { tournamentId = "" } = useParams()
    const tournament = useTournament(tournamentId)

    if (tournament.isPending) return <p className="p-6 text-sm text-muted-foreground">Loading tournament…</p>
    if (tournament.isError) return <p role="alert" className="p-6 text-sm text-destructive">{tournament.error.message}</p>

    const s = tournament.data
    const frozen = s.closedAt !== null

    return (
        <Page>
            <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Link className="transition-colors hover:text-foreground" to="/">Tournaments</Link>
                <ChevronRight className="size-3.5" />
                <span className="text-foreground">{s.name}</span>
            </nav>
            <PageHeader
                title={s.name}
                description={
                    `${s.rounds.length} rounds · matches of ${s.format.competitorsPerMatch}`
                }
                actions={
                    <div className="flex gap-2">
                        {s.current && <Badge>Current</Badge>}
                        {s.closedAt && <Badge variant="secondary">Closed</Badge>}
                        {frozen && <Badge variant="outline">Rules frozen</Badge>}
                    </div>
                }
            />

            <Tabs defaultValue="matches">
                <TabsList variant="line" className="justify-start gap-6 border-b">
                    <TabsTrigger value="matches">Matches</TabsTrigger>
                    <TabsTrigger value="standings">Standings</TabsTrigger>
                    <TabsTrigger value="points">Points</TabsTrigger>
                    <TabsTrigger value="stages">Stages</TabsTrigger>
                    <TabsTrigger value="rules">Round rules</TabsTrigger>
                </TabsList>

                <TabsContent value="matches">
                    <MatchesTab
                        tournamentId={tournamentId}
                        tournament={s}
                        seats={s.format.competitorsPerMatch}
                    />
                </TabsContent>

                <TabsContent value="standings">
                    <StandingsTab tournamentId={tournamentId} />
                </TabsContent>

                <TabsContent value="points">
                    <TournamentPointsCard tournamentId={tournamentId} tournament={s} />
                </TabsContent>

                <TabsContent value="stages">
                    <StagesTab tournamentId={tournamentId} tournament={s} />
                </TabsContent>

                <TabsContent value="rules">
                    <TournamentRulesTab
                        tournamentId={tournamentId}
                        tournament={s}
                        frozen={frozen}
                    />
                </TabsContent>
            </Tabs>
        </Page>
    )
}
