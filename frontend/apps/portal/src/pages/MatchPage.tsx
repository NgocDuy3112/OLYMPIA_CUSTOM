import { Link, useParams } from "react-router-dom"
import { ChevronRight, SearchX } from "lucide-react"
import { buttonVariants } from "@shared/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@shared/ui/tabs"
import { Page, PageHeader, EmptyState, ErrorPanel, ListSkeleton } from "@/components/page"
import { useMatches, useTournament } from "@/lib/tournament"
import { StandardMatchControl, StatusBadge } from "@/components/standard-match-control"
import { MatchQuestionSurface } from "@/components/match-question-surface"


const crumbs = "flex items-center gap-1.5 text-sm text-muted-foreground"
const crumbLink =
    "rounded-sm transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"

export function MatchPage() {
    const { tournamentId, matchId } = useParams()
    const matches = useMatches(tournamentId ?? "")
    const tournament = useTournament(tournamentId ?? "")
    const back = `/tournaments/${tournamentId}`

    if (matches.isPending) {
        return (
            <Page>
                <p role="status" aria-label="Đang tải trận" className="sr-only" />
                <ListSkeleton rows={3} />
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
                        <Link to={back} className={buttonVariants({ variant: "link", size: "sm" })}>
                            Quay lại Matches
                        </Link>
                    }
                />
            </Page>
        )
    }

    let defaultTab: "cau-hoi" | "ket-qua" = "ket-qua"
    if (match.status === "UPCOMING") defaultTab = "cau-hoi"

    return (
        <Page>
            <nav aria-label="Breadcrumb" className={crumbs}>
                <Link className={crumbLink} to="/">Tournaments</Link>
                <ChevronRight className="size-3.5" aria-hidden />
                <Link className={crumbLink} to={back}>
                    {tournament.data?.name ?? "…"}
                </Link>
                <ChevronRight className="size-3.5" aria-hidden />
                <span className="text-foreground">{match.label}</span>
            </nav>

            <PageHeader
                title={match.label}
                description="Câu hỏi và kết quả của trận này."
                actions={<StatusBadge status={match.status} />}
            />

            <Tabs defaultValue={defaultTab}>
                <TabsList variant="line" className="justify-start gap-6 border-b">
                    <TabsTrigger value="cau-hoi">Câu hỏi</TabsTrigger>
                    <TabsTrigger value="ket-qua">Kết quả</TabsTrigger>
                </TabsList>

                <TabsContent value="cau-hoi">
                    <MatchQuestionSurface tournamentId={tournamentId!} match={match} />
                </TabsContent>

                <TabsContent value="ket-qua">
                    <StandardMatchControl tournamentId={tournamentId!} match={match} />
                </TabsContent>

            </Tabs>
        </Page>
    )
}
