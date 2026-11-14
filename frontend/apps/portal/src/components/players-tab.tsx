import { Link } from "react-router-dom"
import { buttonVariants } from "@shared/ui/button"
import { cn } from "cn"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@shared/ui/card"
import { useContestants } from "@/lib/tournament"
import { RosterTable } from "./roster-table"
import { rosterSummary } from "@/lib/roster"

/** Read-only view of one tournament's roster: the Thí sinh tab inside a
 *  tournament page. Every tool (gdi danh, sửa, đặt mật khẩu, bỏ) lives on the
 *  top-level Thí sinh page — see /players. */
export function PlayersTab({ tournamentId }: { tournamentId: string }) {
    const roster = useContestants(tournamentId)

    if (roster.isPending) return <p className="text-sm text-muted-foreground">Loading the roster…</p>
    if (roster.isError) return <p role="alert" className="text-sm text-destructive">{roster.error.message}</p>

    const rows = roster.data.items

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Thí sinh</CardTitle>
                <CardDescription>
                    {rows.length === 0
                        ? "No contestants yet."
                        : `${rosterSummary(rows)} — xem và sửa ở trang Thí sinh.`}
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
                {rows.length === 0 ? (
                    <p className="px-6 pb-6 text-sm text-muted-foreground">
                        A match seats players from this roster — ghi danh họ ở trang Thí sinh trước.
                    </p>
                ) : (
                    <RosterTable rows={rows} />
                )}
            </CardContent>
        </Card>
    )
}
