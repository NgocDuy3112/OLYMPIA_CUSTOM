import type { ReactNode } from "react"
import { Link } from "react-router-dom"
import { buttonVariants } from "@shared/ui/button"
import { cn } from "cn"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@shared/ui/card"
import { useContestants } from "@/lib/tournament"
import { RosterTable } from "./roster-table"
import { rosterSummary } from "@/lib/roster"

export function PlayersTab({ tournamentId }: { tournamentId: string }) {
    const roster = useContestants(tournamentId)

    if (roster.isPending) return <p className="text-sm text-muted-foreground">Loading the roster…</p>
    if (roster.isError) return <p role="alert" className="text-sm text-destructive">{roster.error.message}</p>

    const rows = roster.data.items
    let rosterHint = `${rosterSummary(rows)} — xem và sửa ở trang Thí sinh.`
    if (rows.length === 0) rosterHint = "No contestants yet."
    let rosterSlot: ReactNode = <RosterTable rows={rows} />
    if (rows.length === 0) {
        rosterSlot = (
            <p className="px-6 pb-6 text-sm text-muted-foreground">
                A match seats players from this roster — ghi danh họ ở trang Thí sinh trước.
            </p>
        )
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Thí sinh</CardTitle>
                <CardDescription>
                    {rosterHint}
                </CardDescription>
                <CardAction>
                    <Link
                        to="/players"
                        className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}
                    >
                        Quản lý thí sinh
                    </Link>
                </CardAction>
            </CardHeader>

            <CardContent className="p-0">
                {rosterSlot}
            </CardContent>
        </Card>
    )
}
