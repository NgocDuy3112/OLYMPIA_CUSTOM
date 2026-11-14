import { useState, type FormEvent, type ReactNode } from "react"
import { Pencil, Trash2, UserPlus } from "lucide-react"
import { Badge } from "@shared/ui/badge"
import { Button } from "@shared/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@shared/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@shared/ui/dialog"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@shared/ui/field"
import { Input } from "@shared/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@shared/ui/table"
import {
    useEnrollIntoTournament,
    usePlayers,
    useRemoveFromTournament,
    useUpdatePlayer,
    type PlayerRow,
} from "@/lib/players"
import { useTournaments } from "@/lib/tournaments"
import { DISCORD_SHAPE, discordValue } from "@/lib/discord"

/** The global roster desk: every player account in the system, and the
 *  tournaments each one belongs to. Players arrive here by signing in with
 *  Google; ghi danh / bỏ happens per row, per tournament. */
export function PlayersDesk() {
    const players = usePlayers()
    const tournaments = useTournaments({ limit: 100 })
    const update = useUpdatePlayer()
    const enroll = useEnrollIntoTournament()
    const leave = useRemoveFromTournament()

    const [editing, setEditing] = useState<PlayerRow | null>(null)
    const [editName, setEditName] = useState("")
    const [editEmail, setEditEmail] = useState("")
    const [editDiscord, setEditDiscord] = useState("")

    const [enrolling, setEnrolling] = useState<PlayerRow | null>(null)
    const [enrollTournament, setEnrollTournament] = useState("")
    const [leaving, setLeaving] = useState<PlayerRow | null>(null)
    const [leaveTournament, setLeaveTournament] = useState("")

    const allTournaments = tournaments.data?.items ?? []

    /** Tournaments this player is NOT in yet — the Ghi danh options. */
    const openFor = (row: PlayerRow) =>
        allTournaments.filter(
            (tournament) => !row.enrollments.some((entry) => entry.tournamentId === tournament.id)
        )

    const startEdit = (row: PlayerRow) => {
        closeDialogs()
        setEditing(row)
        setEditName(row.displayName)
        setEditEmail(row.email ?? "")
        setEditDiscord(row.discordId ?? "")
        update.reset()
    }

    const save = (event: FormEvent) => {
        event.preventDefault()
        if (!editing || update.isPending) return
        const trimmed = editName.trim()
        if (!trimmed) return
        const address = editEmail.trim()
        const discord = discordValue(editDiscord)
        if (discord !== "" && !DISCORD_SHAPE.test(discord)) return
        const discordChanged = (editing.discordId ?? "") !== (discord === "" ? "" : discord)
        update.mutate(
            {
                userId: editing.userId,
                displayName: trimmed,
                email: address === "" ? null : address,
                ...(discordChanged ? { discordId: discord === "" ? null : discord } : {}),
            },
            { onSuccess: () => setEditing(null) }
        )
    }

    const closeDialogs = () => {
        setEnrolling(null)
        setLeaving(null)
        setEnrollTournament("")
        setLeaveTournament("")
        enroll.reset()
        leave.reset()
    }

    const openEnroll = (row: PlayerRow) => {
        setEditing(null)
        setLeaving(null)
        leave.reset()
        const options = openFor(row)
        setEnrolling(row)
        setEnrollTournament(options[0]?.id ?? "")
        enroll.reset()
    }

    const submitEnroll = (event: FormEvent) => {
        event.preventDefault()
        if (!enrolling || !enrollTournament || enroll.isPending) return
        enroll.mutate(
            { tournamentId: enrollTournament, userIds: [enrolling.userId] },
            { onSuccess: closeDialogs }
        )
    }

    const openLeave = (row: PlayerRow) => {
        setEditing(null)
        setEnrolling(null)
        enroll.reset()
        setLeaving(row)
        setLeaveTournament(row.enrollments[0]?.tournamentId ?? "")
        leave.reset()
    }

    const submitLeave = (event: FormEvent) => {
        event.preventDefault()
        if (!leaving || !leaveTournament || leave.isPending) return
        leave.mutate(
            { tournamentId: leaveTournament, userId: leaving.userId },
            { onSuccess: closeDialogs }
        )
    }

    if (players.isPending) return <p className="text-sm text-muted-foreground">Loading the players…</p>
    if (players.isError) return <p role="alert" className="text-sm text-destructive">{players.error.message}</p>

    const rows = players.data.items
    const enrolledSomewhere = rows.filter((row) => row.enrollments.length > 0).length

    const actions = (row: PlayerRow): ReactNode => {
        const canEnroll = openFor(row).length > 0
        return (
            <>
                <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => startEdit(row)}
                    title="Sửa tên / email / Discord"
                >
                    <Pencil className="size-3.5" />
                    Sửa
                </Button>
                <Button
                    size="sm"
                    variant="ghost"
                    disabled={!canEnroll || tournaments.isPending}
                    onClick={() => openEnroll(row)}
                    title="Ghi danh vào một giải chưa có mặt"
                >
                    <UserPlus className="size-3.5" />
                    Ghi danh
                </Button>
                <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    disabled={row.enrollments.length === 0}
                    onClick={() => openLeave(row)}
                    title="Rời một giải (từ chối nếu đã thi đấu)"
                >
                    <Trash2 className="size-3.5" />
                    Bỏ
                </Button>
            </>
        )
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Thí sinh</CardTitle>
                <CardDescription>
                    {rows.length === 0
                        ? "Chưa có tài khoản nào."
                        : `${rows.length} tài khoản · ${enrolledSomewhere} ghi danh ít nhất một giải — thí sinh tự xuất hiện ở đây khi đăng nhập Google.`}
                </CardDescription>
                <CardAction>
                    <span className="text-xs text-muted-foreground">
                        Ghi danh từng người vào giải ở cột Actions
                    </span>
                </CardAction>
            </CardHeader>

            <CardContent className="p-0">
                {update.isError && !editing ? (
                    <p role="alert" className="px-6 pb-4 text-sm text-destructive">{update.error.message}</p>
                ) : null}

                {rows.length === 0 ? (
                    <p className="px-6 pb-6 text-sm text-muted-foreground">
                        Thí sinh vào danh sách này ngay khi họ đăng nhập Google — không cần tạo tài khoản ở đây.
                    </p>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="pl-6">Contestant</TableHead>
                                <TableHead>Account</TableHead>
                                <TableHead className="w-36">Discord</TableHead>
                                <TableHead className="w-64">Giải đã ghi danh</TableHead>
                                <TableHead className="w-64 pr-6 text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {rows.map((row) => (
                                <TableRow key={row.userId}>
                                    <TableCell className="pl-6 font-medium">{row.displayName}</TableCell>
                                    <TableCell>
                                        <div className="flex flex-col gap-0.5">
                                            <span
                                                className="font-mono text-xs text-muted-foreground"
                                                title="Tên đăng nhập — định danh nội bộ của thí sinh, không dùng để đăng nhập"
                                            >
                                                {row.username}
                                            </span>
                                            <span className="text-sm">
                                                {row.email ?? (
                                                    <span className="text-muted-foreground">
                                                        không có địa chỉ
                                                    </span>
                                                )}
                                            </span>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        {row.discordId ? (
                                            <span
                                                className="font-mono text-xs"
                                                title={`Discord ID ${row.discordId}`}
                                            >
                                                {row.discordId}
                                            </span>
                                        ) : (
                                            <span
                                                className="text-sm text-muted-foreground"
                                                title="Chưa có ID Discord — bấm Sửa để lưu (dán ID, mention hoặc link đều được)."
                                            >
                                                chưa liên kết
                                            </span>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        {row.enrollments.length === 0 ? (
                                            <span className="text-sm text-muted-foreground">
                                                chưa ghi danh giải nào
                                            </span>
                                        ) : (
                                            <span className="flex flex-wrap gap-1">
                                                {row.enrollments.map((entry) => (
                                                    <Badge key={entry.tournamentId} variant="secondary">
                                                        {entry.name}
                                                        {entry.current ? " · current" : ""}
                                                    </Badge>
                                                ))}
                                            </span>
                                        )}
                                    </TableCell>
                                    <TableCell className="pr-6 text-right">
                                        <span className="flex flex-wrap justify-end gap-1">
                                            {actions(row)}
                                        </span>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </CardContent>

            {editing ? (
                <Dialog open onOpenChange={(next) => { if (!next) setEditing(null) }}>
                    <DialogContent>
                        <form onSubmit={save}>
                            <FieldGroup>
                                <DialogHeader>
                                    <DialogTitle>Sửa thí sinh</DialogTitle>
                                </DialogHeader>

                                <Field>
                                    <FieldLabel htmlFor="edit-player-name">Tên (trên bảng đấu)</FieldLabel>
                                    <Input
                                        id="edit-player-name"
                                        value={editName}
                                        onChange={(event) => setEditName(event.target.value)}
                                        maxLength={100}
                                        aria-label="Edit player name"
                                        autoFocus
                                    />
                                </Field>

                                <Field>
                                    <FieldLabel htmlFor="edit-player-email">Email</FieldLabel>
                                    <Input
                                        id="edit-player-email"
                                        value={editEmail}
                                        onChange={(event) => setEditEmail(event.target.value)}
                                        type="email"
                                        maxLength={255}
                                        aria-label="Edit player email"
                                        placeholder="bỏ trống = không có địa chỉ"
                                    />
                                </Field>

                                <Field>
                                    <FieldLabel htmlFor="edit-player-discord">
                                        Discord ID (15–30 chữ số)
                                    </FieldLabel>
                                    <Input
                                        id="edit-player-discord"
                                        value={editDiscord}
                                        onChange={(event) => setEditDiscord(event.target.value)}
                                        maxLength={64}
                                        inputMode="numeric"
                                        aria-label="Discord ID"
                                        placeholder="dán ID, mention hoặc link"
                                    />
                                    {editDiscord.trim() !== "" &&
                                        !/^[0-9]{15,30}$/.test(discordValue(editDiscord)) && (
                                            <span className="text-xs text-destructive">
                                                ID Discord là dãy 15–30 chữ số
                                            </span>
                                        )}
                                </Field>

                                {update.isError ? (
                                    <p role="alert" className="text-sm text-destructive">
                                        {update.error.message}
                                    </p>
                                ) : null}

                                <DialogFooter>
                                    <Button
                                        type="submit"
                                        disabled={
                                            update.isPending ||
                                            editName.trim().length === 0 ||
                                            (editDiscord.trim() !== "" &&
                                                !/^[0-9]{15,30}$/.test(discordValue(editDiscord)))
                                        }
                                    >
                                        {update.isPending ? "Saving…" : "Lưu"}
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => setEditing(null)}
                                        disabled={update.isPending}
                                    >
                                        Huỷ
                                    </Button>
                                </DialogFooter>
                            </FieldGroup>
                        </form>
                    </DialogContent>
                </Dialog>
            ) : null}

            {enrolling ? (
                <Dialog open onOpenChange={(next) => { if (!next) closeDialogs() }}>
                    <DialogContent>
                        <form onSubmit={submitEnroll}>
                            <FieldGroup>
                                <DialogHeader>
                                    <DialogTitle>Ghi danh {enrolling.displayName}</DialogTitle>
                                </DialogHeader>

                                {tournaments.isPending ? (
                                    <p className="text-sm text-muted-foreground">Đang tải danh sách giải…</p>
                                ) : openFor(enrolling).length === 0 ? (
                                    <p className="text-sm text-muted-foreground">
                                        Tài khoản này đã ghi danh vào tất cả giải.
                                    </p>
                                ) : (
                                    <>
                                        <Field>
                                            <FieldLabel htmlFor="enroll-tournament">Giải</FieldLabel>
                                            <select
                                                id="enroll-tournament"
                                                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
                                                value={enrollTournament}
                                                onChange={(event) => setEnrollTournament(event.target.value)}
                                            >
                                                {openFor(enrolling).map((tournament) => (
                                                    <option key={tournament.id} value={tournament.id}>
                                                        {tournament.name}
                                                        {tournament.current ? " · current" : ""}
                                                    </option>
                                                ))}
                                            </select>
                                            <FieldDescription>
                                                Thí sinh vào bảng của giải này — thi được ngay khi có
                                                trận.
                                            </FieldDescription>
                                        </Field>

                                        {enroll.isError ? (
                                            <p role="alert" className="text-sm text-destructive">
                                                {enroll.error.message}
                                            </p>
                                        ) : null}

                                        <DialogFooter>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                onClick={closeDialogs}
                                                disabled={enroll.isPending}
                                            >
                                                Huỷ
                                            </Button>
                                            <Button
                                                type="submit"
                                                disabled={enroll.isPending || enrollTournament === ""}
                                            >
                                                {enroll.isPending ? "Đang ghi danh…" : "Ghi danh"}
                                            </Button>
                                        </DialogFooter>
                                    </>
                                )}
                            </FieldGroup>
                        </form>
                    </DialogContent>
                </Dialog>
            ) : null}

            {leaving ? (
                <Dialog open onOpenChange={(next) => { if (!next) closeDialogs() }}>
                    <DialogContent>
                        <form onSubmit={submitLeave}>
                            <FieldGroup>
                                <DialogHeader>
                                    <DialogTitle>Bỏ {leaving.displayName} khỏi giải</DialogTitle>
                                </DialogHeader>

                                <Field>
                                    <FieldLabel htmlFor="leave-tournament">Giải</FieldLabel>
                                    <select
                                        id="leave-tournament"
                                        className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
                                        value={leaveTournament}
                                        onChange={(event) => setLeaveTournament(event.target.value)}
                                    >
                                        {leaving.enrollments.map((entry) => (
                                            <option key={entry.tournamentId} value={entry.tournamentId}>
                                                {entry.name}
                                            </option>
                                        ))}
                                    </select>
                                    <FieldDescription>
                                        Từ chối nếu thí sinh đã có kết quả ở giải này.
                                    </FieldDescription>
                                </Field>

                                {leave.isError ? (
                                    <p role="alert" className="text-sm text-destructive">
                                        {leave.error.message}
                                    </p>
                                ) : null}

                                <DialogFooter>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={closeDialogs}
                                        disabled={leave.isPending}
                                    >
                                        Huỷ
                                    </Button>
                                    <Button
                                        type="submit"
                                        variant="destructive"
                                        disabled={leave.isPending || leaveTournament === ""}
                                    >
                                        {leave.isPending ? "Đang bỏ…" : "Bỏ"}
                                    </Button>
                                </DialogFooter>
                            </FieldGroup>
                        </form>
                    </DialogContent>
                </Dialog>
            ) : null}
        </Card>
    )
}
