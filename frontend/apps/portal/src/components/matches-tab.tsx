import { useState } from "react"
import { Link } from "react-router-dom"
import { RefreshCw, X } from "lucide-react"
import { Badge } from "@shared/ui/badge"
import { Button } from "@shared/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@shared/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@shared/ui/table"
import { allowedSeatsOf, seatsPhrase } from "@/lib/tournaments"
import {
    useEjectSeat,
    useEnrolled,
    useMatchCodes,
    useMatches,
    useRotateMatchCode,
    type TournamentDetail,
} from "@/lib/tournament"
import { NewMatchDialog } from "./new-match-dialog"


const short = (id: string) => id.slice(0, 8)


export function MatchesTab({
    tournamentId,
    tournament,
    seats,
}: {
    tournamentId: string
    tournament: TournamentDetail
    seats: number
}) {
    const matches = useMatches(tournamentId)
    const enrolled = useEnrolled(tournamentId)
    const codes = useMatchCodes(tournamentId)
    const rotate = useRotateMatchCode(tournamentId)
    const eject = useEjectSeat(tournamentId)
    const allowedSeats = allowedSeatsOf(tournament.format)

    const [creating, setCreating] = useState(false)
    const openStage = (matchId: string) =>
        window.open(`/tournaments/${tournamentId}/matches/${matchId}/stage`, "_blank")

    if (matches.isPending) return <p className="text-sm text-muted-foreground">Loading matches…</p>
    if (matches.isError) return <p role="alert" className="text-sm text-destructive">{matches.error.message}</p>

    const data = matches.data
    const names = new Map((enrolled.data?.items ?? []).map((row) => [row.userId, row.displayName]))
    const nameOf = (userId: string) => names.get(userId) ?? `Unknown (${short(userId)})`
    const codeOf = (matchId: string) =>
        (codes.data?.items ?? []).find((item) => item.matchId === matchId)

    return (
        <div className="flex flex-col gap-4">
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Matches</CardTitle>
                    <CardDescription>
                        {data.items.length === 0
                            ? "No matches yet. Create the first one."
                            : `${data.items.length} match${data.items.length === 1 ? "" : "es"}`}
                    </CardDescription>
                    <CardAction>
                        <Button size="sm" variant="outline" onClick={() => setCreating(true)}>
                            New match
                        </Button>
                    </CardAction>
                </CardHeader>

                <CardContent className="p-0">
                    {rotate.isError ? (
                        <p role="alert" className="px-6 pb-4 text-sm text-destructive">{rotate.error.message}</p>
                    ) : null}
                    {eject.isError ? (
                        <p role="alert" className="px-6 pb-4 text-sm text-destructive">{eject.error.message}</p>
                    ) : null}

                    {data.items.length === 0 ? (
                        <p className="px-6 pb-6 text-sm text-muted-foreground">
                            A match seats {seatsPhrase(allowedSeats)} players.
                        </p>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="pl-6">Match</TableHead>
                                    <TableHead>Players</TableHead>
                                    <TableHead className="w-40 pr-6 text-right">Status</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {data.items.map((match) => {
                                    const seated = match.players.flatMap((seat) =>
                                        seat.userId ? [seat.userId] : [])
                                    const code = codeOf(match.id)
                                    return (
                                        <TableRow key={match.id}>
                                            <TableCell className="pl-6">
                                                <div className="flex items-center gap-2">
                                                    <Link
                                                        to={`/tournaments/${tournamentId}/matches/${match.id}`}
                                                        className="font-medium hover:underline"
                                                        title="Mở trận — xem và thêm câu hỏi"
                                                    >
                                                        {match.label}
                                                    </Link>
                                                </div>
                                                <div className="text-xs text-muted-foreground">
                                                    {match.stageId}
                                                </div>
                                                
                                                <div
                                                    className={
                                                        match.questions.length > 0
                                                            ? "text-xs text-muted-foreground"
                                                            : match.status === "UPCOMING"
                                                              ? "text-xs text-amber-600 dark:text-amber-500"
                                                              : "text-xs text-muted-foreground"
                                                    }
                                                >
                                                    {match.questions.length > 0
                                                        ? `${match.questions.length} câu hỏi`
                                                        : match.status === "UPCOMING"
                                                          ? "chưa có câu — nhấn để thêm"
                                                          : "chưa có câu hỏi"}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-wrap gap-1">
                                                    {seated.map((userId) => (
                                                        <span
                                                            key={userId}
                                                            className="flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-xs"
                                                        >
                                                            {nameOf(userId)}
                                                            {match.status === "UPCOMING" ? (
                                                                <button
                                                                    type="button"
                                                                    aria-label={`Gỡ ${nameOf(userId)} khỏi trận`}
                                                                    title="Gỡ khỏi trận — thí sinh vào nhầm mã"
                                                                    disabled={eject.isPending}
                                                                    onClick={() =>
                                                                        eject.mutate({ matchId: match.id, userId })
                                                                    }
                                                                    className="text-muted-foreground hover:text-destructive"
                                                                >
                                                                    <X className="size-3" aria-hidden />
                                                                </button>
                                                            ) : null}
                                                        </span>
                                                    ))}
                                                </div>
                                            </TableCell>
                                            <TableCell className="pr-6 text-right">
                                                {match.status === "FINISHED" ? (
                                                    <Badge variant="secondary">FINISHED</Badge>
                                                ) : (
                                                    <div className="flex flex-col items-end gap-1">
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            onClick={() => openStage(match.id)}
                                                        >
                                                            Control
                                                        </Button>
                                                        {codes.data ? (
                                                            <div className="flex items-center justify-end gap-1">
                                                                {code ? (
                                                                    <span
                                                                        className="font-mono text-xs tracking-widest text-muted-foreground"
                                                                        title={`Mã thí sinh gõ ở ô «Nhập mã» của app gameplay — hết hạn ${new Date(code.expiresAt).toLocaleString()}`}
                                                                    >
                                                                        Mã {code.code}
                                                                    </span>
                                                                ) : null}
                                                                <Button
                                                                    size="sm"
                                                                    variant="ghost"
                                                                    disabled={
                                                                        rotate.isPending && rotate.variables === match.id
                                                                    }
                                                                    onClick={() => rotate.mutate(match.id)}
                                                                    title={
                                                                        code
                                                                            ? "Xoay mã — mã cũ ngừng hoạt động ngay, ghế và tài khoản không đổi"
                                                                            : "Tạo mã vào phòng cho thí sinh"
                                                                    }
                                                                >
                                                                    <RefreshCw className="size-3" aria-hidden />
                                                                    {rotate.isPending && rotate.variables === match.id
                                                                        ? "…"
                                                                        : code
                                                                          ? "Xoay"
                                                                          : "Tạo mã"}
                                                                </Button>
                                                            </div>
                                                        ) : null}
                                                    </div>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    )
                                })}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            {creating && (
                <NewMatchDialog
                    tournamentId={tournamentId}
                    tournament={tournament}
                    seats={seats}
                    allowedSeats={allowedSeats}
                    open
                    onOpenChange={(open) => { if (!open) setCreating(false) }}
                />
            )}
        </div>
    )
}
