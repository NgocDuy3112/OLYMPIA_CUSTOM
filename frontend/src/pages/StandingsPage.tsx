import { Link } from "react-router-dom"
import { ArrowLeft } from "lucide-react"
import { buttonVariants } from "@/components/ui/button"
import { StandingsPanel } from "@/components/standings/StandingsPanel"
import { PointsRulesPanel } from "@/components/standings/PointsRulesPanel"
import type { StandingRow, Tournament } from "@/data/schedule"

interface StandingsPageProps {
    tournament: Tournament
    rows: StandingRow[]
    loading?: boolean
}

export function StandingsPage({ tournament, rows, loading = false }: StandingsPageProps) {
    if (loading) {
        return (
            <div
                role="status"
                aria-label="Loading standings"
                className="mx-auto w-full max-w-6xl px-4 py-6 md:py-10"
            >
                <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
                    <div className="h-96 animate-pulse rounded-xl bg-muted" />
                    <div className="h-96 animate-pulse rounded-xl bg-muted" />
                </div>
            </div>
        )
    }

    return (
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 md:py-10">
            <div className="flex items-center justify-between gap-3">
                <Link
                    to="/"
                    className={buttonVariants({ variant: "ghost", size: "sm" })}
                >
                    <ArrowLeft />
                    Back
                </Link>
                <span className="text-sm text-muted-foreground">
                    {tournament.name}
                </span>
            </div>

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
                <StandingsPanel rows={rows} showPrev />
                <PointsRulesPanel />
            </div>
        </div>
    )
}