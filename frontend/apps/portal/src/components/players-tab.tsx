
import { Link } from "react-router-dom"
import { buttonVariants } from "@shared/ui/button"
import { cn } from "cn"
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from "@shared/ui/card"
import { useContestants } from "@/lib/tournament"
import { rosterSummary } from "@/lib/roster"

export function PlayersTab({ tournamentId }: { tournamentId: string }) {
    const roster = useContestants(tournamentId)

    if (roster.isPending) return <p className="text-sm text-muted-foreground">Loading the roster…</p>
    if (roster.isError) return <p role="alert" className="text-sm text-destructive">{roster.error.message}</p>

    const rows = roster.data.items
    let rosterHint = `${rosterSummary(rows)} — xem và sửa ở trang Thí sinh.`
    if (rows.length === 0) rosterHint = "No contestants yet."
    

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

        </Card>
    )
}
