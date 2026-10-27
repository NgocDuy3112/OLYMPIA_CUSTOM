import { Link } from "react-router-dom"
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle
} from "@shared/ui/card"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@shared/ui/table"
import { Trophy, ArrowRight } from "lucide-react"
import { cn } from "cn"
import type { StandingRow } from "@/lib/types"

// The places table: a player is ranked by HOW FAR THEY GOT — the last stage they
// reached, and their rank inside it. The points are a statistic, never the key.

interface StandingsPanelProps {
    rows: StandingRow[]
    viewAllTo?: string
    onSelectRow?: (row: StandingRow) => void
}

export function StandingsPanel({
    rows,
    viewAllTo,
    onSelectRow
}: StandingsPanelProps) {
    return (
        <Card className="h-fit lg:sticky lg:top-3 [--card-spacing:--spacing(6)]">
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl">
                    <Trophy className="size-4" aria-hidden />
                    Olympia Custom Ranking
                </CardTitle>
                <CardDescription>
                    Xếp hạng theo tiến độ — thí sinh càng đi sâu, thứ hạng càng cao
                </CardDescription>
            </CardHeader>
            <CardContent>
                <Table className={cn("[&_th]:h-10 [&_th]:text-sm [&_td]:py-2.5 [&_td]:text-base")}>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-8">#</TableHead>
                            <TableHead>Thí sinh</TableHead>
                            <TableHead>Đã tới vòng</TableHead>
                            <TableHead className="text-center">Trận</TableHead>
                            <TableHead className="text-center">Điểm</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {rows.map((row) => (
                            <TableRow
                                key={row.id}
                                tabIndex={onSelectRow ? 0 : undefined}
                                className={cn(onSelectRow && "cursor-pointer")}
                                onClick={() => onSelectRow?.(row)}
                            >
                                <TableCell className="tabular-nums text-muted-foreground">
                                    {row.rank ?? "—"}
                                </TableCell>
                                <TableCell className="font-medium">
                                    {row.name}
                                </TableCell>
                                <TableCell className="text-sm text-muted-foreground">
                                    {row.stageTitle ?? "—"}
                                </TableCell>
                                <TableCell className="text-center tabular-nums">
                                    {row.matchesPlayed}
                                </TableCell>
                                <TableCell className="text-center font-semibold tabular-nums">
                                    {row.points}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
                {viewAllTo && (
                    <Link
                        to={viewAllTo}
                        className="mt-1 flex items-center justify-end gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                    >
                        Xem chi tiết bảng xếp hạng
                        <ArrowRight className="size-3.5" aria-hidden />
                    </Link>
                )}
            </CardContent>
        </Card>
    )
}
