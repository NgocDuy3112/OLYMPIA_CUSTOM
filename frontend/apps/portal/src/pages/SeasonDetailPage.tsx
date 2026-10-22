import { Link, useParams } from "react-router-dom"
import { Badge } from "@shared/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@shared/ui/tabs"
import { Page, PageHeader } from "@/components/page"
import { useSeason } from "@/lib/progression"
import { SplittingTab } from "@/components/splitting-tab"
import { SeasonRulesTab } from "@/components/season-rules-tab"
import { ChevronRight } from "lucide-react"


export function SeasonDetailPage() {
    const { tournamentId = "", seasonId = "" } = useParams()
    const season = useSeason(tournamentId, seasonId)

    if (season.isPending) return <p className="p-6 text-sm text-muted-foreground">Loading season…</p>
    if (season.isError) return <p role="alert" className="p-6 text-sm text-destructive">{season.error.message}</p>

    const s = season.data
    const frozen = s.qualificationQuestions !== null || s.closedAt !== null

    return (
        <Page>
            <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Link className="transition-colors hover:text-foreground" to="/">Tournaments</Link>
                <ChevronRight className="size-3.5" />
                <Link
                    className="transition-colors hover:text-foreground"
                    to={`/tournaments/${tournamentId}`}
                >
                    Tournament
                </Link>
                <ChevronRight className="size-3.5" />
                <span className="text-foreground">{s.name}</span>
            </nav>
            <PageHeader
                title={s.name}
                description={
                    s.progression
                        ? `${s.progression.advance} players · matches of ${s.progression.groupSize} · ${s.progression.splittingRounds} rounds`
                        : "No progression configured — this season cannot advance."
                }
                actions={
                    <div className="flex gap-2">
                        {s.current && <Badge>Current</Badge>}
                        {s.closedAt && <Badge variant="secondary">Closed</Badge>}
                        {frozen && <Badge variant="outline">Rules frozen</Badge>}
                    </div>
                }
            />

            <Tabs defaultValue="rules">
                <TabsList variant="line" className="justify-start gap-6 border-b">
                    <TabsTrigger value="rules">Round rules</TabsTrigger>
                    <TabsTrigger value="splitting">Splitting</TabsTrigger>
                </TabsList>

                <TabsContent value="rules">
                    <SeasonRulesTab
                        tournamentId={tournamentId}
                        seasonId={seasonId}
                        season={s}
                        frozen={frozen}
                    />
                </TabsContent>

                <TabsContent value="splitting">
                    <SplittingTab tournamentId={tournamentId} seasonId={seasonId} />
                </TabsContent>
            </Tabs>
        </Page>
    )
}