import { Link, useParams } from "react-router-dom"
import { ChevronRight, SearchX } from "lucide-react"
import { Badge } from "@shared/ui/badge"
import { Page, PageHeader, EmptyState, ErrorPanel } from "@/components/page"
import { useMatches, useTournament, useMassEvent } from "@/lib/tournament"
import { turnControls } from "@/lib/mass-event"
import { MassEventControl } from "@/components/mass-event-control"
import { StandardMatchControl } from "@/components/standard-match-control"

// The match's own page — every match operation lives HERE, not in dialogs
// (recorded decision, 2310: running a match is a task with its own flow).
// Built on the portal's page anatomy: Page + breadcrumb + PageHeader — so it
// reads as a page, not as dialog content on white.
//
//   QUALIFICATION → the mass event's control room (turns, live count, current
//                   question, field, close, ranking)
//   STANDARD      → identity + assembly state + start transition + result entry
//
// Language: the match page speaks Vietnamese (the show's language); the portal
// chrome around it (nav bar, "Tournaments" breadcrumb root) stays English.
// Route: /tournaments/:tournamentId/matches/:matchId

const STATUS_VN = {
    UPCOMING: "Sắp diễn ra",
    LIVE: "Trực tiếp",
    FINISHED: "Đã kết thúc",
} as const

const KIND_VN = {
    QUALIFICATION: "Sự kiện toàn trường",
    STANDARD: "Trận đấu points",
} as const

const STATUS_VARIANT = {
    UPCOMING: "outline",
    LIVE: "destructive",
    FINISHED: "secondary",
} as const

export function MatchPage() {
    const { tournamentId, matchId } = useParams()
    const matches = useMatches(tournamentId ?? "")
    const tournament = useTournament(tournamentId ?? "")
    // Same cache key as the control below → no extra request; the header badge
    // and the band read one truth.
    const massView = useMassEvent(tournamentId ?? "", matchId ?? "")
    const back = `/tournaments/${tournamentId}`

    if (matches.isPending) {
        return (
            <Page>
                <div role="status" aria-label="Đang tải trận" className="h-64 animate-pulse rounded-xl bg-muted" />
            </Page>
        )
    }

    const tournamentName = tournament.data?.name ?? "…"
    // Safe before the error branch: on a failed query there is no data at all.
    const match = matches.data?.items.find((row) => row.id === matchId)

    const crumbs = (
        <nav className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
            <Link className="transition-colors hover:text-foreground" to="/">Tournaments</Link>
            <ChevronRight className="size-3.5" />
            <Link className="transition-colors hover:text-foreground" to={back}>{tournamentName}</Link>
            <ChevronRight className="size-3.5" />
            <Link className="transition-colors hover:text-foreground" to={back}>Matches</Link>
            <ChevronRight className="size-3.5" />
            <span className="text-foreground">{match?.label ?? "…"}</span>
        </nav>
    )

    if (matches.isError) {
        return (
            <Page>
                {crumbs}
                <PageHeader title="Không tải được trận đấu" />
                <ErrorPanel message={matches.error.message} />
            </Page>
        )
    }

    if (!match) {
        return (
            <Page>
                {crumbs}
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

    const isMassEvent = match.kind === "QUALIFICATION"

    // The header badge tells THIS surface's truth: for a mass event that is the
    // TURN state (Chưa mở / Đang mở / Đã đóng) — the match status sits at
    // UPCOMING until close and would contradict the band below it.
    const statusBadge = (() => {
        if (!isMassEvent) {
            return <Badge variant={STATUS_VARIANT[match.status]}>{STATUS_VN[match.status]}</Badge>
        }
        if (!massView.data) return null // the band renders the state until the view lands
        const controls = turnControls({
            closed: massView.data.closed,
            opened: massView.data.opened,
            currentPosition: massView.data.currentPosition,
            questionCount: massView.data.questionCount,
            currentAnswered: massView.data.currentAnswered,
            fieldSize: massView.data.field.length,
        })
        return controls.phase === "closed"
            ? <Badge variant="secondary">Đã đóng</Badge>
            : controls.phase === "open"
                ? <Badge variant="destructive">Đang mở</Badge>
                : <Badge variant="outline">Chưa mở</Badge>
    })()

    return (
        <Page>
            {crumbs}
            <PageHeader
                title={match.label}
                description={
                    isMassEvent
                        ? `${KIND_VN.QUALIFICATION} · ${match.questions.length} câu hỏi · ${match.players.length} thí sinh`
                        : `${KIND_VN.STANDARD} · ${match.stageId}${match.slot !== null ? ` · Slot ${match.slot}` : ""}`
                }
                actions={
                    <div className="flex gap-2">
                        {statusBadge}
                        <Badge variant="outline">{KIND_VN[match.kind]}</Badge>
                    </div>
                }
            />

            {isMassEvent ? (
                <MassEventControl
                    tournamentId={tournamentId!}
                    matchId={match.id}
                    seats={match.players.length || 4}
                />
            ) : (
                <StandardMatchControl tournamentId={tournamentId!} match={match} />
            )}
        </Page>
    )
}
