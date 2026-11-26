import { useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { Badge } from "@shared/ui/badge"
import { Button } from "@shared/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@shared/ui/tabs"
import { Page, PageHeader } from "@/components/page"
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog"
import { useDeleteTournament, useMatches, useTournament } from "@/lib/tournament"
import { useMe } from "@/lib/session"
import { MatchesTab } from "@/components/matches-tab"
import { StagesTab } from "@/components/stages-tab"
import { StandingsTab } from "@/components/standings-tab"
import { GroupsTab } from "@/components/groups-tab"
import { ChevronRight, Trash2 } from "lucide-react"


export function TournamentDetailPage() {
    const { tournamentId = "" } = useParams()
    const navigate = useNavigate()
    const tournament = useTournament(tournamentId)
    const matches = useMatches(tournamentId)
    const me = useMe()
    const remove = useDeleteTournament(tournamentId)
    const [confirming, setConfirming] = useState(false)

    if (tournament.isPending) return <p className="p-6 text-sm text-muted-foreground">Loading tournament…</p>
    if (tournament.isError) return <p role="alert" className="p-6 text-sm text-destructive">{tournament.error.message}</p>

    const s = tournament.data
    const assembled = matches.isPending || (matches.data?.items ?? []).some((match) => match.questions.length > 0)
    const frozen = s.closedAt !== null || assembled
    const isAdmin = me.data?.role === "ADMIN"
    let deleteTitle = "Only an admin can delete a tournament"
    if (isAdmin) deleteTitle = "Delete tournament"
    let deleteError: string | null = null
    if (remove.isError) deleteError = remove.error.message

    return (
        <Page>
            <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Link className="transition-colors hover:text-foreground" to="/">Tournaments</Link>
                <ChevronRight className="size-3.5" />
                <span className="text-foreground">{s.name}</span>
            </nav>
            <PageHeader
                title={s.name}
                actions={
                    <div className="flex items-center gap-2">
                        {s.current && <Badge>Current</Badge>}
                        {s.closedAt && <Badge variant="secondary">Closed</Badge>}
                        {frozen && <Badge variant="outline">Rules frozen</Badge>}
                        <Button
                            size="sm"
                            variant="destructive"
                            aria-label="Delete tournament"
                            title={deleteTitle}
                            disabled={!isAdmin || remove.isPending}
                            onClick={() => setConfirming(true)}
                        >
                            <Trash2 className="size-4" aria-hidden /> Delete
                        </Button>
                    </div>
                }
            />

            <Tabs defaultValue="matches">
                <TabsList variant="line" className="justify-start gap-6 border-b">
                    <TabsTrigger value="matches">Matches</TabsTrigger>
                    <TabsTrigger value="standings">Standings</TabsTrigger>
                    <TabsTrigger value="groups">Groups</TabsTrigger>
                    <TabsTrigger value="stages">Stages</TabsTrigger>
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

                <TabsContent value="groups">
                    <GroupsTab tournamentId={tournamentId} />
                </TabsContent>

                <TabsContent value="stages">
                    <StagesTab tournamentId={tournamentId} tournament={s} />
                </TabsContent>

            </Tabs>

            {confirming && (
                <ConfirmDeleteDialog
                    title="Delete this tournament?"
                    subject={s.name}
                    description="It disappears from every list. Its matches, standings and assembled questions stay in the database."
                    error={deleteError}
                    pending={remove.isPending}
                    onCancel={() => setConfirming(false)}
                    onConfirm={() => remove.mutate(undefined, { onSuccess: () => navigate("/") })}
                />
            )}
        </Page>
    )
}
