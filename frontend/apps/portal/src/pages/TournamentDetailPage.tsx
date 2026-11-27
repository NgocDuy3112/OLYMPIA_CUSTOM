import { useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { Badge } from "@shared/ui/badge"
import { Button } from "@shared/ui/button"
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@shared/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@shared/ui/tabs"
import { errorMessage } from "@shared/lib/error-text"
import { ErrorPanel, ListSkeleton, Page, PageHeader } from "@/components/page"
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog"
import { useCloseTournament, useDeleteTournament, useMatches, useTournament } from "@/lib/tournament"
import { useMe } from "@/lib/session"
import { MatchesTab } from "@/components/matches-tab"
import { StagesTab } from "@/components/stages-tab"
import { StandingsTab } from "@/components/standings-tab"
import { GroupsTab } from "@/components/groups-tab"
import { ChevronRight, Lock, Trash2 } from "lucide-react"


export function TournamentDetailPage() {
    const { tournamentId = "" } = useParams()
    const navigate = useNavigate()
    const tournament = useTournament(tournamentId)
    const matches = useMatches(tournamentId)
    const me = useMe()
    const remove = useDeleteTournament(tournamentId)
    const close = useCloseTournament(tournamentId)
    const [confirming, setConfirming] = useState(false)
    const [closing, setClosing] = useState(false)

    if (tournament.isPending) {
        return (
            <Page>
                <ListSkeleton rows={3} />
            </Page>
        )
    }
    if (tournament.isError) {
        return (
            <Page>
                <ErrorPanel message={errorMessage(tournament.error)} />
            </Page>
        )
    }

    const s = tournament.data
    const assembled = matches.isPending || (matches.data?.items ?? []).some((match) => match.questions.length > 0)
    const frozen = s.closedAt !== null || assembled
    const isAdmin = me.data?.role === "ADMIN"
    const isOwner = me.data?.id === s.ownerId
    const canClose = (isAdmin || isOwner) && s.closedAt === null
    let closeTitle = "Close tournament"
    if (s.closedAt !== null) closeTitle = "Tournament already closed"
    else if (!canClose) closeTitle = "Only the owner or an admin can close a tournament"
    let deleteTitle = "Only an admin can delete a tournament"
    if (isAdmin) deleteTitle = "Delete tournament"
    let deleteError: string | null = null
    if (remove.isError) deleteError = remove.error.message
    let closeError: string | null = null
    if (close.isError) closeError = errorMessage(close.error)

    return (
        <Page>
            <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Link
                    className="rounded-sm transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
                    to="/"
                >
                    Tournaments
                </Link>
                <ChevronRight className="size-3.5" aria-hidden />
                <span className="text-foreground">{s.name}</span>
            </nav>
            <PageHeader
                title={s.name}
                description="Matches, standings, groups and stages of this tournament."
                actions={
                    <div className="flex flex-wrap items-center justify-end gap-2">
                        {s.current && <Badge>Current</Badge>}
                        {s.closedAt && <Badge variant="secondary">Closed</Badge>}
                        {frozen && <Badge variant="outline">Rules frozen</Badge>}
                        <Button
                            size="sm"
                            variant="outline"
                            aria-label="Close tournament"
                            title={closeTitle}
                            disabled={!canClose || close.isPending}
                            onClick={() => setClosing(true)}
                        >
                            <Lock className="size-4" aria-hidden /> Close
                        </Button>
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

            {closing && (
                <Dialog open onOpenChange={(next) => { if (!next) setClosing(false) }}>
                    <DialogContent className="sm:max-w-md">
                        <DialogHeader>
                            <DialogTitle>Close this tournament?</DialogTitle>
                        </DialogHeader>
                        <div className="grid gap-3">
                            <p className="rounded-lg border px-3 py-2 text-sm text-foreground">{s.name}</p>
                            <p className="text-sm text-muted-foreground">
                                It stops being the current tournament and refuses further changes. Its matches,
                                standings and assembled questions stay.
                            </p>
                        </div>
                        {closeError && <p role="alert" className="text-sm text-destructive">{closeError}</p>}
                        <DialogFooter className="gap-2">
                            <Button variant="outline" onClick={() => setClosing(false)} disabled={close.isPending}>
                                Cancel
                            </Button>
                            <Button
                                disabled={close.isPending}
                                onClick={() => close.mutate(undefined, { onSuccess: () => setClosing(false) })}
                            >
                                Close tournament
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            )}

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
