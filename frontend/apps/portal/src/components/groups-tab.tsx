import { Button } from "@shared/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@shared/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@shared/ui/table"
import { errorMessage } from "@shared/lib/error-text"
import { ErrorPanel, ListSkeleton } from "@/components/page"
import { useAssignGroup, useGroups, type GroupRow } from "@/lib/tournament"


const FRAME_SEATS = 4

const other = (group: "A" | "B"): "A" | "B" => {
    if (group === "A") return "B"
    return "A"
}

export function GroupsTab({ tournamentId }: { tournamentId: string }) {
    const groups = useGroups(tournamentId)
    const assign = useAssignGroup(tournamentId)


    if (groups.isPending) return <ListSkeleton />
    if (groups.isError) return <ErrorPanel message={errorMessage(groups.error)} />

    const { groups: blocks, unassigned } = groups.data
    const drawn = blocks.reduce((total, block) => total + block.rows.length, 0)
    const busy = assign.isPending
    const place = (userId: string, group: "A" | "B" | null) => assign.mutate({ userId, group })
    const enrolled = drawn + unassigned.length
    let plural = "s"
    if (unassigned.length === 1) plural = ""
    let notDrawnHint = `${unassigned.length} enrolled contestant${plural} waiting for the draw.`
    if (unassigned.length === 0) notDrawnHint = `Every enrolled contestant has a group (${enrolled}).`
    if (enrolled === 0) notDrawnHint = "No contestants yet — enroll them on the Thí sinh page, then draw them here."

    return (
        <div className="flex flex-col gap-4">

            {assign.isError && (
                <p role="alert" className="text-sm text-destructive">{assign.error.message}</p>
            )}

            <div className="grid gap-4 md:grid-cols-2">
                {blocks.map((block) => (
                    <Card key={block.id}>
                        <CardHeader>
                            <CardTitle className="text-base">Nhóm {block.id}</CardTitle>
                            <CardAction>
                                <span className="text-sm text-muted-foreground">
                                    Tổng điểm nhóm{" "}
                                    <b className="tabular-nums text-foreground">{block.groupPoints}</b>
                                </span>
                            </CardAction>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-10">#</TableHead>
                                        <TableHead>Contestant</TableHead>
                                        <TableHead className="text-right">Điểm nhóm</TableHead>
                                        <TableHead className="w-32 whitespace-normal text-right">
                                            Thành tích TB
                                        </TableHead>
                                        <TableHead className="w-20" />
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {block.rows.map((row, i) => (
                                        <GroupMemberRow
                                            key={row.userId}
                                            row={row}
                                            seat={i + 1}
                                            group={block.id}
                                            disabled={busy}
                                            onMove={() => place(row.userId, other(block.id))}
                                        />
                                    ))}
                                    {Array.from({ length: Math.max(0, FRAME_SEATS - block.rows.length) }, (_, i) => (
                                        <TableRow key={`empty-${i}`}>
                                            <TableCell className="text-muted-foreground tabular-nums">
                                                {block.rows.length + i + 1}
                                            </TableCell>
                                            <TableCell className="text-muted-foreground">—</TableCell>
                                            <TableCell className="text-right text-muted-foreground">—</TableCell>
                                            <TableCell className="text-right text-muted-foreground">—</TableCell>
                                            <TableCell />
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                ))}
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Not drawn</CardTitle>
                    <CardDescription>
                        {notDrawnHint}
                    </CardDescription>

                </CardHeader>
                <CardContent>
                    {unassigned.length > 0 && (
                        <ul className="flex flex-col divide-y">
                            {unassigned.map((row) => (
                                <li key={row.userId} className="flex items-center justify-between gap-2 py-2">
                                    <span className="text-sm">{row.displayName}</span>
                                    <span className="flex gap-2">
                                        <Button size="sm" variant="outline" disabled={busy} onClick={() => place(row.userId, "A")}>
                                            Nhóm A
                                        </Button>
                                        <Button size="sm" variant="outline" disabled={busy} onClick={() => place(row.userId, "B")}>
                                            Nhóm B
                                        </Button>
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}

function GroupMemberRow({ row, seat, group, disabled, onMove }: {
    row: GroupRow
    seat: number
    group: "A" | "B"
    disabled: boolean
    onMove: () => void
}) {
    let matchSuffix = "es"
    if (row.matchesPlayed === 1) matchSuffix = ""
    let averageText = "—"
    if (row.averages.all !== null) averageText = row.averages.all.toFixed(1)
    return (
        <TableRow>
            <TableCell className="text-muted-foreground tabular-nums">{seat}</TableCell>
            <TableCell>
                {row.displayName}
                <span className="ml-2 text-xs text-muted-foreground tabular-nums">
                    {row.matchesPlayed} match{matchSuffix}
                </span>
            </TableCell>
            <TableCell className="text-right tabular-nums">{row.bankedPoints}</TableCell>
            <TableCell
                className="text-right tabular-nums"
                title="Thành tích TB: điểm mỗi trận vòng bảng (phase 1 không xuống dưới 0)"
            >
                {averageText}
            </TableCell>
            <TableCell className="text-right">
                <Button size="sm" variant="ghost" disabled={disabled} onClick={onMove} title={`Chuyển sang Nhóm ${other(group)}`}>
                    → {other(group)}
                </Button>
            </TableCell>
        </TableRow>
    )
}
