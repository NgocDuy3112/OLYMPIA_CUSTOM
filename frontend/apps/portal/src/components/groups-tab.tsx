import { Button } from "@shared/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@shared/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@shared/ui/table"
import { useAssignGroup, useGroups, type GroupRow } from "@/lib/tournament"


const FRAME_SEATS = 4

const other = (group: "A" | "B"): "A" | "B" => (group === "A" ? "B" : "A")

export function GroupsTab({ tournamentId }: { tournamentId: string }) {
    const groups = useGroups(tournamentId)
    const assign = useAssignGroup(tournamentId)


    if (groups.isPending) return <p className="text-sm text-muted-foreground">Loading the group stage…</p>
    if (groups.isError) return <p role="alert" className="text-sm text-destructive">{groups.error.message}</p>

    const { groups: blocks, unassigned } = groups.data
    const drawn = blocks.reduce((total, block) => total + block.rows.length, 0)
    const busy = assign.isPending
    const place = (userId: string, group: "A" | "B" | null) => assign.mutate({ userId, group })
    const enrolled = drawn + unassigned.length

    return (
        <div className="flex flex-col gap-4">

            {assign.isError ? (
                <p role="alert" className="text-sm text-destructive">{assign.error.message}</p>
            ) : null}

            <div className="grid gap-4 md:grid-cols-2">
                {blocks.map((block) => (
                    <Card key={block.id}>
                        <CardHeader>
                            <CardTitle className="text-base">Nhóm {block.id}</CardTitle>
                            <CardAction>
                                <span className="text-sm text-muted-foreground">
                                    Tổng điểm nhóm{" "}
                                    <b className="tabular-nums text-foreground">{block.teamPoints}</b>
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
                        {enrolled === 0
                            ? "No contestants yet — add them in the Thí sinh tab, then draw them here."
                            : unassigned.length === 0
                                ? `Every enrolled contestant has a group (${enrolled}).`
                                : `${unassigned.length} enrolled contestant${unassigned.length === 1 ? "" : "s"} waiting for the draw.`}
                    </CardDescription>

                </CardHeader>
                <CardContent>
                    {unassigned.length === 0 ? null : (
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
    return (
        <TableRow>
            <TableCell className="text-muted-foreground tabular-nums">{seat}</TableCell>
            <TableCell>
                {row.displayName}
                <span className="ml-2 text-xs text-muted-foreground tabular-nums">
                    {row.matchesPlayed} match{row.matchesPlayed === 1 ? "" : "es"}
                </span>
            </TableCell>
            <TableCell className="text-right tabular-nums">{row.bankedPoints}</TableCell>
            <TableCell
                className="text-right tabular-nums"
                title="Thành tích TB: điểm mỗi trận vòng bảng (phase 1 không xuống dưới 0)"
            >
                {row.averages.all === null ? "—" : row.averages.all.toFixed(1)}
            </TableCell>
            <TableCell className="text-right">
                <Button size="sm" variant="ghost" disabled={disabled} onClick={onMove} title={`Chuyển sang Nhóm ${other(group)}`}>
                    → {other(group)}
                </Button>
            </TableCell>
        </TableRow>
    )
}
