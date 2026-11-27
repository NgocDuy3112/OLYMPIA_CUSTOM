import { StandingsPanel } from "@shared/results/standings/StandingsPanel"
import { PageHeader } from "@shared/results/PageHeader"
import type { Match, StandingRow } from "@shared/results/types"
import { PlayerDrawer } from "@shared/results/standings/PlayerDrawer"
import { useState } from "react"

interface StandingsPageProps {
    rows: StandingRow[]
    matches: Match[]
    loading?: boolean
}

export function StandingsPage({ rows, matches, loading = false }: StandingsPageProps) {
    const [selected, setSelected] = useState<StandingRow | null>(null)
    
    if (loading) {
        return (
            <div
                role="status"
                aria-label="Đang tải bảng xếp hạng"
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
            <PageHeader
                title="Bảng xếp hạng"
                description="Toàn bộ thí sinh của giải đấu, xếp theo thứ hạng hiện tại"
            />
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
            </div>
        </div>
    )
}