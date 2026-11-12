import { Link, useParams } from "react-router-dom"
import { ChevronRight, SearchX } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@shared/ui/tabs"
import { Page, PageHeader, EmptyState, ErrorPanel } from "@/components/page"
import { useMatches, useTournament } from "@/lib/tournament"
import { StandardMatchControl, StatusBadge } from "@/components/standard-match-control"
import { MatchQuestionSurface } from "@/components/match-question-surface"
import { RecordingsTab } from "@/components/recordings-tab"
import { Controller } from "@/console/controller"


export function MatchPage() {
    const { tournamentId, matchId } = useParams()
    const matches = useMatches(tournamentId ?? "")
    const tournament = useTournament(tournamentId ?? "")
    const back = `/tournaments/${tournamentId}`

    if (matches.isPending) {
        return (
            <Page>
                <div role="status" aria-label="Đang tải trận" className="h-64 animate-pulse rounded-xl bg-muted" />
            </Page>
        )
    }

    const match = matches.data?.items.find((row) => row.id === matchId)


    if (matches.isError) {
        return (
            <Page>
                <PageHeader title="Không tải được trận đấu" />
                <ErrorPanel message={matches.error.message} />
            </Page>
        )
    }

    if (!match) {
        return (
            <Page>
                <PageHeader title="Không tìm thấy trận đấu" />
                <EmptyState
                    icon={SearchX}
                    title="Trận đấu không tồn tại"
                    description="Nó có thể đã bị xóa — quay lại danh sách trận của giải."
                    action={
                        <Link to={back} className="text-sm text-primary underline-offset-4 hover:underline">
                            Quay lại Matches
                        </Link>
                    }
                />
            </Page>
        )
    }

    // UPCOMING opens on the assembly surface; once running or done, scoring is the job.
    const defaultTab = match.status === "UPCOMING" ? "cau-hoi" : "ket-qua"

    return (
        <Page>
            <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Link className="transition-colors hover:text-foreground" to="/">Tournaments</Link>
                <ChevronRight className="size-3.5" />
                <Link className="transition-colors hover:text-foreground" to={back}>
                    {tournament.data?.name ?? "…"}
                </Link>
                <ChevronRight className="size-3.5" />
                <span className="text-foreground">{match.label}</span>
            </nav>

            <PageHeader
                title={match.label}
                actions={<StatusBadge status={match.status} />}
            />

            {match.status === "LIVE" && (
                // the stage sizes itself from its container's height (container-type:
                // size), and flex-1 inside this auto-height page gave it 0 — the
                // aspect box is the definite height it was missing
                <div className="flex w-full flex-col aspect-video min-h-[380px]">
                    <Controller tournamentId={tournamentId!} matchId={match.id} />
                </div>
            )}

            <Tabs defaultValue={defaultTab}>
                <TabsList variant="line" className="justify-start gap-6 border-b">
                    <TabsTrigger value="cau-hoi">Câu hỏi</TabsTrigger>
                    <TabsTrigger value="ket-qua">Kết quả</TabsTrigger>
                    {match.status !== "UPCOMING" && (
                        <TabsTrigger value="ban-ghi">Bản ghi</TabsTrigger>
                    )}
                </TabsList>

                <TabsContent value="cau-hoi">
                    <MatchQuestionSurface tournamentId={tournamentId!} match={match} />
                </TabsContent>

                <TabsContent value="ket-qua">
                    <StandardMatchControl tournamentId={tournamentId!} match={match} />
                </TabsContent>

                {match.status !== "UPCOMING" && (
                    <TabsContent value="ban-ghi">
                        <RecordingsTab tournamentId={tournamentId!} matchId={match.id} />
                    </TabsContent>
                )}
            </Tabs>
        </Page>
    )
}
