import { Link } from "react-router-dom"
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
    CardAction
} from "@/components/ui/card"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Trophy } from "lucide-react"
import { carryOverPoints } from "@/lib/rankingPoints"
import type { StandingRow } from "@/data/schedule"

interface StandingsPanelProps {
    rows: StandingRow[]
    showPrev?: boolean
    viewAllLink?: boolean
}

export function StandingsPanel({
    rows,
    showPrev = false,
    viewAllLink = false,
}: StandingsPanelProps) {
    return (
        <Card className="h-fit lg:sticky lg:top-4">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Trophy className="size-4" aria-hidden />
                    Standings
                </CardTitle>
                <CardDescription>
                    {showPrev
                        ? "Points by best placement + ½ of last season"
                        : "Points by best placement"}
                </CardDescription>
                {viewAllLink && (
                    <CardAction>
                        <Link
                            to="/standings"
                            className="text-xs text-muted-foreground hover:text-foreground"
                        >
                            View all
                        </Link>
                    </CardAction>
                )}
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-8">#</TableHead>
                            <TableHead>Player</TableHead>
                            <TableHead className="text-right">Best</TableHead>
                            {showPrev && (
                                <TableHead className="text-right">Prev</TableHead>
                            )}
                            <TableHead className="text-right">Pts</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {rows.map((row) => {
                            const carry = carryOverPoints(row.prevPoints)
                            const total = row.points + carry

                            return (
                                <TableRow key={row.name}>
                                    <TableCell className="tabular-nums text-muted-foreground">
                                        {row.rank}
                                    </TableCell>
                                    <TableCell className="font-medium">
                                        {row.name}
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums">
                                        {row.best}
                                    </TableCell>
                                    {showPrev && (
                                        <TableCell className="text-right tabular-nums text-muted-foreground">
                                            {carry}
                                        </TableCell>
                                    )}
                                    <TableCell className="text-right font-semibold tabular-nums">
                                        {showPrev ? total : row.points}
                                    </TableCell>
                                </TableRow>
                            )
                        })}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    )
}