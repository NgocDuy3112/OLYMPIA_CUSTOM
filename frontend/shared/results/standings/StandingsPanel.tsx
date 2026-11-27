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
import { Trophy, ArrowRight, Users } from "lucide-react"
import { cn } from "cn"
import { SOLID_SURFACE } from "@shared/ui/solid"
import { EmptyState } from "@shared/ui/state"
import type { StandingRow } from "@shared/results/types"


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
        <Card className={cn(SOLID_SURFACE, "h-fit lg:sticky lg:top-3 [--card-spacing:--spacing(6)]")}>
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl">
                    <Trophy className="size-4" aria-hidden />
                    AOC Ranking
                </CardTitle>
                <CardDescription>
                    Xếp hạng theo tiến độ — thí sinh càng đi sâu, thứ hạng càng cao
                </CardDescription>
            </CardHeader>
            <CardContent>
                {rows.length === 0 ? (
                    <EmptyState
                        icon={Users}
                        title="Chưa có thí sinh"
                        description="Bảng xếp hạng xuất hiện khi giải đấu bắt đầu."
                    />
                ) : (
                <Table className={cn("min-w-[28rem] [&_th]:h-10 [&_th]:px-3 [&_th]:text-xs [&_th]:tracking-wide [&_th]:text-muted-foreground [&_th]:uppercase [&_td]:px-3 [&_td]:py-2.5 [&_td]:text-base")}>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-8">#</TableHead>
                            <TableHead>Thí sinh</TableHead>
                            <TableHead>Đã tới vòng</TableHead>
                            <TableHead className="text-center">Trận</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {rows.map((row) => {
                            let tabIndex: number | undefined = undefined
                            if (onSelectRow) tabIndex = 0
                            return (
                                <TableRow
                                    key={row.id}
                                    tabIndex={tabIndex}
                                    onKeyDown={onSelectRow ? (event) => {
                                        if (event.key !== "Enter" && event.key !== " ") return
                                        event.preventDefault()
                                        onSelectRow(row)
                                    } : undefined}
                                    className={cn(onSelectRow && "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring")}
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
                                </TableRow>
                            )
                        })}
                    </TableBody>
                </Table>
                )}
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
