import { Link } from "react-router-dom"
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle
} from "@/components/ui/card"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Trophy, ArrowRight, Medal } from "lucide-react"
import { cn } from "cn"
import { carryOverPoints, placementLabel } from "@/lib/rankingPoints"
import type { StandingRow } from "@/data/schedule"

interface StandingsPanelProps {
    rows: StandingRow[]
    showPrev?: boolean
    showBatch?: boolean
    viewAllLink?: boolean
    onSelectRow?: (row: StandingRow) => void
}

export function StandingsPanel({
    rows,
    showPrev = false,
    showBatch = false,
    viewAllLink = false,
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
                    Điểm tích luỹ mùa hiện tại và tổng điểm của 2 mùa gần nhất
                </CardDescription>
            </CardHeader>
            <CardContent>
                <Table className={cn("[&_th]:h-10 [&_th]:text-sm [&_td]:py-2.5 [&_td]:text-base")}>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-8">#</TableHead>
                            <TableHead>Thí sinh</TableHead>
                            <TableHead className="text-center">Tổng điểm</TableHead>
                            <TableHead className="text-center">Mùa này</TableHead>
                            {showPrev && (
                                <TableHead className="text-center">Mùa trước</TableHead>
                            )}
                            {showBatch && (
                                <TableHead>Thành tích</TableHead>
                            )}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {rows.map((row) => {
                            const carry = carryOverPoints(row.prevPoints)
                            const total = row.points + carry

                            return (
                                <TableRow
                                    key={row.id}
                                    tabIndex={onSelectRow ? 0 : undefined}
                                    className={cn(onSelectRow && "cursor-pointer")}
                                    onClick={() => onSelectRow?.(row)}
                                >
                                    <TableCell className="tabular-nums text-muted-foreground">
                                        {row.rank}
                                    </TableCell>
                                    <TableCell className="font-medium">
                                        {row.name}
                                    </TableCell>
                                    <TableCell className="text-center font-semibold tabular-nums">
                                        {total}
                                    </TableCell>
                                    <TableCell className="text-center tabular-nums">
                                        {row.points}
                                    </TableCell>
                                    {showPrev && (
                                        <TableCell className="text-center tabular-nums text-muted-foreground">
                                            {row.prevPoints}
                                        </TableCell>
                                    )}
                                    {showBatch && (
                                        <TableCell>
                                            <RankChip placement={row.best} />
                                        </TableCell>
                                    )}
                                </TableRow>
                            )
                        })}
                    </TableBody>
                </Table>
                {viewAllLink && (
                    <Link
                        to="/standings"
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

function RankChip({ placement }: { placement: number }) {
    const style =
        placement === 1
            ? "border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300"
            : placement === 2
                ? "border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                : placement === 3
                    ? "border-orange-300 bg-orange-100 text-orange-900 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-300"
                    : "border-border bg-muted text-muted-foreground"

    return (
        <span
            className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
                style
            )}
        >
            <Medal className="size-3" aria-hidden />
            {placementLabel(placement)}
        </span>
    )
}