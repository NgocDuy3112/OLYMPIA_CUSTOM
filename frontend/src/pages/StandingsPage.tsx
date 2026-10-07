import { Link } from "react-router-dom"
import { ArrowLeft } from "lucide-react"
import { buttonVariants } from "@/components/ui/button"
import { StandingsPanel } from "@/components/standings/StandingsPanel"
import { PointsRulesPanel } from "@/components/standings/PointsRulesPanel"
import type { Match, StandingRow, Tournament } from "@/data/schedule"
import { PlayerDrawer } from "@/components/standings/PlayerDrawer"
import { useState } from "react"

interface StandingsPageProps {
    tournament: Tournament
    rows: StandingRow[]
    matches: Match[]
    loading?: boolean
}

export function StandingsPage({ tournament, rows, matches, loading = false }: StandingsPageProps) {
    const [selected, setSelected] = useState<StandingRow | null>(null)
    
    if (loading) {
        return (
            <div
                role="status"
                aria-label="Loading standings"
                className="mx-auto w-full px-4 py-6 md:py-10"
            >
                <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
                    <div className="h-96 animate-pulse rounded-xl bg-muted" />
                    <div className="h-96 animate-pulse rounded-xl bg-muted" />
                </div>
            </div>
        )
    }

    return (
        <div className="mx-auto flex w-full flex-col gap-6 px-4 py-6 md:py-10">
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

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
                <StandingsPanel 
                    rows={rows} 
                    showPrev 
                    showBatch 
                    onSelectRow={setSelected}
                />
                {selected && (
                    <PlayerDrawer
                        player={selected}
                        matches={matches}
                        open
                        onOpenChange={(open) => {
                            if (!open) setSelected(null)
                        }}
                    />
                )}
                <PointsRulesPanel />
            </div>
        </div>
    )
}