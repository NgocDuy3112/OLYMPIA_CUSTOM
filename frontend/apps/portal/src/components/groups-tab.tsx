import { Badge } from "@shared/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@shared/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@shared/ui/table"

// The AOC GROUP STAGE — a FRAME, not a read-out.
//
// This is deliberately static: the groups exist as drawn shape (Nhóm A / Nhóm B,
// four seats each) and the contestants are filled in LATER, by the operator, at
// the draw. Nothing here reads the API, and nothing here is clickable — so a
// half-drawn group can never look like a finished one.
//
// The rows are the contract the wiring will satisfy: a seat, a contestant, the
// team points their matches bank. Adding a real source means passing `groups`
// instead of the default skeleton — the markup does not change.

export interface GroupSeat {
    /** Seat index inside the group (1-based, as drawn). */
    seat: number
    /** The contestant's display name — null until the draw fills it. */
    name: string | null
    /** What this contestant has banked for the group, null = not started. */
    points: number | null
}

export interface Group {
    /** "A" | "B" today; the label is the tournament's, so it stays a string. */
    id: string
    seats: GroupSeat[]
}

/** Four seats per group — the AOC group stage's fixed shape. */
const SEATS_PER_GROUP = 4

const skeleton = (id: string): Group => ({
    id,
    seats: Array.from({ length: SEATS_PER_GROUP }, (_, i) => ({ seat: i + 1, name: null, points: null })),
})

const DEFAULT_GROUPS: Group[] = [skeleton("A"), skeleton("B")]

export function GroupsTab({ groups = DEFAULT_GROUPS }: { groups?: Group[] }) {
    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
                <Badge variant="outline">Frame only</Badge>
                <p className="text-sm text-muted-foreground">
                    The groups are drawn here; contestants are filled in at the draw by the operator.
                </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
                {groups.map((group) => (
                    <Card key={group.id}>
                        <CardHeader>
                            <CardTitle className="text-base">Nhóm {group.id}</CardTitle>
                            <CardDescription>
                                {group.seats.length} seats · team points bank for the group
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-10">#</TableHead>
                                        <TableHead>Contestant</TableHead>
                                        <TableHead className="text-right">Points</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {group.seats.map((seat) => (
                                        <TableRow key={seat.seat}>
                                            <TableCell className="text-muted-foreground tabular-nums">{seat.seat}</TableCell>
                                            <TableCell>
                                                {seat.name ?? <span className="text-muted-foreground">—</span>}
                                            </TableCell>
                                            <TableCell className="text-right tabular-nums">
                                                {seat.points ?? <span className="text-muted-foreground">—</span>}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    )
}
