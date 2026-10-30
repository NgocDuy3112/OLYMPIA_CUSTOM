import type { ReactNode } from "react"
import { Link, useParams } from "react-router-dom"
import { SearchX } from "lucide-react"
import { PageHeader, EmptyState, ErrorPanel } from "@/components/page"
import { useMatches } from "@/lib/tournament"
import { StandardMatchControl } from "@/components/standard-match-control"
import { Controller } from "@/console/controller"


function FullPage({ children }: { children: ReactNode }) {
    return (
        <div className="flex w-full flex-col gap-6 px-4 py-6 sm:px-6 lg:px-10">
            {children}
        </div>
    )
}

export function MatchPage() {
    const { tournamentId, matchId } = useParams()
    const matches = useMatches(tournamentId ?? "")
    const back = `/tournaments/${tournamentId}`

    if (matches.isPending) {
        return (
            <FullPage>
                <div role="status" aria-label="Đang tải trận" className="h-64 animate-pulse rounded-xl bg-muted" />
            </FullPage>
        )
    }

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

    return (
        <FullPage>
            {match.status === "LIVE" && (
                <Controller tournamentId={tournamentId!} matchId={match.id} />
            )}
            <StandardMatchControl tournamentId={tournamentId!} match={match} />
        </FullPage>
    )
}
