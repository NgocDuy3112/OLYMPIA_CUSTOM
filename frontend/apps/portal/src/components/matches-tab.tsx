import { useState, type ReactNode } from "react"
import { Link } from "react-router-dom"
import { RefreshCw, Trash2, X } from "lucide-react"
import { Badge } from "@shared/ui/badge"
import { Button } from "@shared/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@shared/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@shared/ui/table"
import { errorMessage } from "@shared/lib/error-text"
import { ErrorPanel, ListSkeleton } from "@/components/page"
import { allowedSeatsOf, seatsPhrase } from "@/lib/tournaments"
import { useMe } from "@/lib/session"
import {
    useDeleteMatch,
    useEjectSeat,
    useEnrolled,
    useMatchCodes,
    useMatches,
    useRotateMatchCode,
    useTransitionMatch,
    type MatchSummary,
    type TournamentDetail,
} from "@/lib/tournament"
import { ConfirmDeleteDialog } from "./confirm-delete-dialog"
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
    const remove = useDeleteMatch(tournamentId)
    const me = useMe()
    const isAdmin = me.data?.role === "ADMIN"
    const allowedSeats = allowedSeatsOf(tournament.format)

    const [creating, setCreating] = useState(false)
    const [deleting, setDeleting] = useState<MatchSummary | null>(null)
    const transition = useTransitionMatch(tournamentId)

    const openStage = (match: { id: string; status: string }) => {
        // open synchronously inside the click — window.open after the async
        // transition would be blocked as a popup
        window.open(`/tournaments/${tournamentId}/matches/${match.id}/control`, "_blank")
        if (match.status === "UPCOMING") {
            transition.mutate({ matchId: match.id, status: "LIVE" })
        }
    }

    if (matches.isPending) return <ListSkeleton />
    if (matches.isError) return <ErrorPanel message={errorMessage(matches.error)} />

    const data = matches.data
    const names = new Map((enrolled.data?.items ?? []).map((row) => [row.userId, row.displayName]))
    const nameOf = (userId: string) => names.get(userId) ?? `Unknown (${short(userId)})`
    const codeOf = (matchId: string) =>
        (codes.data?.items ?? []).find((item) => item.matchId === matchId)

    let plural = "es"
    if (data.items.length === 1) plural = ""
    let matchSummary = `${data.items.length} match${plural}`
    if (data.items.length === 0) matchSummary = "No matches yet. Create the first one."
    let deleteError: string | null = null
    if (remove.isError) deleteError = remove.error.message

    let matchesSlot: ReactNode = (
        <Table className="min-w-[44rem]">
            <TableHeader>
                <TableRow>
                    <TableHead className="pl-6">Match</TableHead>
                    <TableHead>Players</TableHead>
                    <TableHead className="w-40 pr-6 text-right">Status</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {data.items.map((match) => {
                    const seated = match.players.flatMap((seat) => {
                        if (seat.userId) return [seat.userId]
                        return []
                    })
                    const code = codeOf(match.id)
                    let questionCls = "text-xs text-muted-foreground"
                    if (match.status === "UPCOMING") questionCls = "text-xs text-amber-600 dark:text-amber-500"
                    if (match.questions.length > 0) questionCls = "text-xs text-muted-foreground"
                    let questionText = "chưa có câu hỏi"
                    if (match.status === "UPCOMING") questionText = "chưa có câu — nhấn để thêm"
                    if (match.questions.length > 0) questionText = `${match.questions.length} câu hỏi`
                    let rotateTitle = "Tạo mã vào phòng cho thí sinh"
                    if (code) rotateTitle = "Xoay mã — mã cũ ngừng hoạt động ngay, ghế và tài khoản không đổi"
                    let rotating = false
                    if (rotate.isPending) {
                        if (rotate.variables === match.id) rotating = true
                    }
                    let rotateLabel = "Tạo mã"
                    if (code) rotateLabel = "Xoay"
                    if (rotating) rotateLabel = "…"
                    let statusSlot: ReactNode = (
                        <div className="flex flex-col items-end gap-1">
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openStage(match)}
                                disabled={transition.isPending}
                            >
                                Control
                            </Button>
                            {codes.data && (
                                <div className="flex items-center justify-end gap-1">
                                    {code && (
                                        <span
                                            className="font-mono text-xs tracking-widest text-muted-foreground"
                                            title={`Mã thí sinh gõ ở ô «Nhập mã» của app gameplay — hết hạn ${new Date(code.expiresAt).toLocaleString()}`}
                                        >
                                            Mã {code.code}
                                        </span>
                                    )}
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        disabled={rotating}
                                        onClick={() => rotate.mutate(match.id)}
                                        title={rotateTitle}
                                    >
                                        <RefreshCw className="size-3" aria-hidden />
                                        {rotateLabel}
                                    </Button>
                                </div>
                            )}
                        </div>
                    )
                    if (match.status === "FINISHED") {
                        statusSlot = <Badge variant="secondary">FINISHED</Badge>
                    }
                    let deleteTitle = "Only an UPCOMING match can be deleted"
                    if (match.status === "UPCOMING") deleteTitle = "Delete match"
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
                                
                                <div className={questionCls}>
                                    {questionText}
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
                                            {match.status === "UPCOMING" && (
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
                                            )}
                                        </span>
                                    ))}
                                </div>
                            </TableCell>
                            <TableCell className="pr-6 text-right">
                                <div className="flex items-center justify-end gap-1">
                                    {statusSlot}
                                    {isAdmin && (
                                        <Button
                                            size="icon-sm"
                                            variant="ghost"
                                            aria-label={`Delete match ${match.label}`}
                                            title={deleteTitle}
                                            disabled={match.status !== "UPCOMING" || remove.isPending}
                                            onClick={() => setDeleting(match)}
                                        >
                                            <Trash2 className="size-3.5" aria-hidden />
                                        </Button>
                                    )}
                                </div>
                            </TableCell>
                        </TableRow>
                    )
                })}
            </TableBody>
        </Table>
    )
    if (data.items.length === 0) {
        matchesSlot = (
            <p className="px-6 pb-6 text-sm text-muted-foreground">
                A match seats {seatsPhrase(allowedSeats)} players.
            </p>
        )
    }

    return (
        <div className="flex flex-col gap-4">
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Matches</CardTitle>
                    <CardDescription>
                        {matchSummary}
                    </CardDescription>
                    <CardAction>
                        <Button size="sm" variant="outline" onClick={() => setCreating(true)}>
                            New match
                        </Button>
                    </CardAction>
                </CardHeader>

                <CardContent className="p-0">
                    {rotate.isError && (
                        <p role="alert" className="px-6 pb-4 text-sm text-destructive">{rotate.error.message}</p>
                    )}
                    {eject.isError && (
                        <p role="alert" className="px-6 pb-4 text-sm text-destructive">{eject.error.message}</p>
                    )}

                    {matchesSlot}
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

            {deleting && (
                <ConfirmDeleteDialog
                    title="Delete this match?"
                    subject={deleting.label}
                    description="The match disappears from the tournament. Only UPCOMING matches can be deleted."
                    error={deleteError}
                    pending={remove.isPending}
                    onCancel={() => setDeleting(null)}
                    onConfirm={() => remove.mutate(deleting.id, { onSuccess: () => setDeleting(null) })}
                />
            )}
        </div>
    )
}
