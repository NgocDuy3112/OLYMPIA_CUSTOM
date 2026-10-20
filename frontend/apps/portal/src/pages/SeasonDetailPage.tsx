import { useParams } from "react-router-dom"
import { Badge } from "@shared/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@shared/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@shared/ui/tabs"
import { EmptyState, Page, PageHeader } from "@/components/page"
import { RoundRulesCard } from "@/components/round-rules-card"
import { useSeason } from "@/lib/progression"
import { Layers } from "lucide-react"

export function SeasonDetailPage() {
    const { tournamentId = "", seasonId = "" } = useParams()
    const season = useSeason(tournamentId, seasonId)

    if (season.isPending) return <p className="p-6 text-sm text-muted-foreground">Loading season…</p>
    if (season.isError) return <p role="alert" className="p-6 text-sm text-destructive">{season.error.message}</p>

    const s = season.data
    const frozen = s.qualificationQuestions !== null || s.closedAt !== null
    const rounds = [...s.rounds].sort((a, b) => a.order - b.order)

    return (
        <Page>
            <PageHeader
                title={s.name}
                description={s.progression
                    ? `Top ${s.progression.advance} advance · matches of ${s.progression.groupSize} · ${s.progression.splittingRounds} splitting round(s)`
                    : "No progression configured — this season cannot advance."}
                actions={
                    <div className="flex gap-2">
                        {s.current && <Badge>Current</Badge>}
                        {s.closedAt && <Badge variant="secondary">Closed</Badge>}
                        {frozen && <Badge variant="outline">Rules frozen</Badge>}
                    </div>
                }
            />

            <Tabs defaultValue="rules">
                <TabsList>
                    <TabsTrigger value="rules">Round rules</TabsTrigger>
                    <TabsTrigger value="splitting">Splitting</TabsTrigger>
                </TabsList>

                <TabsContent value="rules" className="flex flex-col gap-4">
                    {rounds.length === 0 ? (
                        <EmptyState
                            icon={Layers}
                            title="This season has no rounds"
                            description="Add rounds to the tournament, then create a new season from it."
                        />
                    ) : (
                        rounds.map((round) => (
                            <RoundRulesCard
                                key={round.id}
                                tournamentId={tournamentId}
                                seasonId={seasonId}
                                season={s}
                                round={round}
                                disabled={frozen}
                            />
                        ))
                    )}
                </TabsContent>

                <TabsContent value="splitting">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Splitting</CardTitle>
                            <CardDescription>Next: the draw form.</CardDescription>
                        </CardHeader>
                        <CardContent className="text-sm text-muted-foreground">
                            {s.progression
                                ? `${s.progression.advance} players advance into ${s.progression.groupSize} matches of ${s.progression.groupSize}.`
                                : "No progression configured on this season."}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </Page>
    )
}