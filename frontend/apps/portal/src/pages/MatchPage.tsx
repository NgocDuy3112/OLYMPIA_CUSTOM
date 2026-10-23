import type { ReactNode } from "react"
import { Link, useParams } from "react-router-dom"
import { SearchX } from "lucide-react"
import { Badge } from "@shared/ui/badge"
import { PageHeader, EmptyState, ErrorPanel } from "@/components/page"
import { useMatches, useMassEvent } from "@/lib/tournament"
import { turnControls } from "@/lib/mass-event"
import { MassEventControl } from "@/components/mass-event-control"
import { StandardMatchControl } from "@/components/standard-match-control"


function FullPage({ children }: { children: ReactNode }) {
    return (
        <div className="flex w-full flex-col gap-6 px-4 py-6 sm:px-6 lg:px-10">
            {children}
        </div>
    )
}

const STATUS_VN = {
    UPCOMING: "Sắp diễn ra",
    LIVE: "Trực tiếp",
    FINISHED: "Đã kết thúc",
} as const

const KIND_VN = {
    QUALIFICATION: "Vòng loại",
    STANDARD: "Trận đấu",
} as const

const STATUS_VARIANT = {
    UPCOMING: "outline",
    LIVE: "destructive",
    FINISHED: "secondary",
} as const

export function MatchPage() {
    const { tournamentId, matchId } = useParams()
    const matches = useMatches(tournamentId ?? "")
    // Same cache key as the control below → no extra request; the header badge
    // and the band read one truth.
    const massView = useMassEvent(tournamentId ?? "", matchId ?? "")
    const back = `/tournaments/${tournamentId}`

    if (matches.isPending) {
        return (
            <FullPage>
                <div role="status" aria-label="Đang tải trận" className="h-64 animate-pulse rounded-xl bg-muted" />
            </FullPage>
        )
    }

    // Safe before the error branch: on a failed query there is no data at all.
    const match = matches.data?.items.find((row) => row.id === matchId)


    if (matches.isError) {
        return (
            <FullPage>
                <PageHeader title="Không tải được trận đấu" />
                <ErrorPanel message={matches.error.message} />
            </FullPage>
        )
    }

    if (!match) {
        return (
            <FullPage>
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
            </FullPage>
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
        <FullPage>
            <PageHeader
                title={match.label}
                description={
                    isMassEvent
                        ? `${match.questions.length} câu hỏi · ${match.players.length} thí sinh`
                        : `${match.stageId}${match.slot !== null ? ` · Slot ${match.slot}` : ""}`
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
        </FullPage>
    )
}
