import { StandingsPanel } from "@/components/standings/StandingsPanel"
import { PointsRulesPanel } from "@/components/standings/PointsRulesPanel"
import type { PlacementTier } from "@/lib/api"
import type { Match, StandingRow } from "@/lib/types"
import { PlayerDrawer } from "@/components/standings/PlayerDrawer"
import { useState } from "react"

interface StandingsPageProps {
    rows: StandingRow[]
    matches: Match[]
    placementTiers: PlacementTier[]
    loading?: boolean
}

export function StandingsPage({ rows, matches, placementTiers, loading = false }: StandingsPageProps) {
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
        <div className="mx-auto flex w-full flex-col max-w-360 gap-6 px-4 py-6 md:py-10">
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
                <StandingsPanel
                    rows={rows}
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
                <PointsRulesPanel tiers={placementTiers} />
            </div>
        </div>
    )
}