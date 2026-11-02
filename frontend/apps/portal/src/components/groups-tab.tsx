import { Badge } from "@shared/ui/badge"
import { Button } from "@shared/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@shared/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@shared/ui/table"
import { useAssignGroup, useGroups, type GroupRow } from "@/lib/tournament"

// The AOC group stage — Nhóm A / Nhóm B.
//
// The table is DERIVED: the server builds it from the roster's groups plus the
// phase matches' frozen results (`engine/scoring/group-stage.ts`), so nothing
// here is an editable score. The one write is the DRAW — placing a contestant in
// a group — which is what turns the empty frame into a filled table.

/**
 * How many placeholder seats the frame draws while a Nhóm is still empty. NOT a
 * cap: a group holds whatever is drawn into it (only MATCHES are limited to 3 or
 * 4 contestants). The skeleton just keeps the two cards the same height.
 */
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

    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
                {drawn === 0 ? <Badge variant="outline">Frame only</Badge> : null}
                <p className="text-sm text-muted-foreground">
                    {drawn === 0
                        ? "The groups are drawn here; contestants are filled in at the draw by the operator."
                        : `${drawn} drawn · ${unassigned.length} still to place. Placement points bank to each contestant's group.`}
                </p>
            </div>

            {assign.isError ? (
                <p role="alert" className="text-sm text-destructive">{assign.error.message}</p>
            ) : null}

            <div className="grid gap-4 md:grid-cols-2">
                {blocks.map((block) => (
                    <Card key={block.id}>
                        <CardHeader>
                            <CardTitle className="text-base">Nhóm {block.id}</CardTitle>
                            <CardDescription>
                                {block.rows.length} seats · team points bank for the group
                            </CardDescription>
                            <CardAction>
                                <span className="text-sm font-semibold tabular-nums">{block.teamPoints} pts</span>
                            </CardAction>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-10">#</TableHead>
                                        <TableHead>Contestant</TableHead>
                                        <TableHead className="text-right">Points</TableHead>
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
                        {unassigned.length === 0
                            ? "Every enrolled contestant has a group."
                            : "Enrolled contestants waiting for the draw."}
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

/** One drawn contestant: what they banked, and the way to the other group. */
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
            <TableCell className="text-right">
                <Button size="sm" variant="ghost" disabled={disabled} onClick={onMove} title={`Chuyển sang Nhóm ${other(group)}`}>
                    → {other(group)}
                </Button>
            </TableCell>
        </TableRow>
    )
}
