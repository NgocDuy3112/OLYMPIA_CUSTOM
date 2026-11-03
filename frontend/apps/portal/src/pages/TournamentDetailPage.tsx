import { Link, useParams } from "react-router-dom"
import { Badge } from "@shared/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@shared/ui/tabs"
import { Page, PageHeader } from "@/components/page"
import { useMatches, useTournament } from "@/lib/tournament"
import { MatchesTab } from "@/components/matches-tab"
import { TournamentRulesTab } from "@/components/tournament-rules-tab"
import { StagesTab } from "@/components/stages-tab"
import { StandingsTab } from "@/components/standings-tab"
import { GroupsTab } from "@/components/groups-tab"
import { PlayersTab } from "@/components/players-tab"
import { ChevronRight } from "lucide-react"


export function TournamentDetailPage() {
    const { tournamentId = "" } = useParams()
    const tournament = useTournament(tournamentId)
    // The freeze signal is the SERVER's rule: the rulebook is frozen once a match
    // has been assembled (its questions are the rulebook's output), or once the
    // tournament is closed. Reading only `closedAt` let the dialog offer edits the
    // server then refused with a 409.
    const matches = useMatches(tournamentId)

    if (tournament.isPending) return <p className="p-6 text-sm text-muted-foreground">Loading tournament…</p>
    if (tournament.isError) return <p role="alert" className="p-6 text-sm text-destructive">{tournament.error.message}</p>

    const s = tournament.data
    // Until the match list lands, assume frozen: a false affordance that 409s is
    // worse than a button that enables a moment late.
    const assembled = matches.isPending || (matches.data?.items ?? []).some((match) => match.questions.length > 0)
    const frozen = s.closedAt !== null || assembled

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
                    <TabsTrigger value="players">Thí sinh</TabsTrigger>
                    <TabsTrigger value="groups">Groups</TabsTrigger>
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

                <TabsContent value="players">
                    <PlayersTab tournamentId={tournamentId} frozen={frozen} />
                </TabsContent>

                <TabsContent value="groups">
                    <GroupsTab tournamentId={tournamentId} />
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
