import { useState, type FormEvent, type ReactNode } from "react"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@shared/ui/card"
import { errorMessage } from "@shared/lib/error-text"
import { ErrorPanel, ListSkeleton } from "@/components/page"
import {
    useEnrollIntoTournament,
    usePlayers,
    useRemoveFromTournament,
    useUpdatePlayer,
    type PlayerRow,
} from "@/lib/players"
import { useTournaments } from "@/lib/tournaments"
import { DISCORD_SHAPE, discordValue } from "@/lib/discord"
import { EditPlayerDialog } from "./players-desk/edit-player-dialog"
import { EnrollDialog } from "./players-desk/enroll-dialog"
import { LeaveDialog } from "./players-desk/leave-dialog"
import { PlayersTable } from "./players-desk/players-table"

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
        const discordChanged = (editing.discordId ?? "") !== discord
        let email: string | null = address
        if (address === "") email = null
        let discordId: string | null = discord
        if (discord === "") discordId = null
        const input: { userId: string; displayName: string; email: string | null; discordId?: string | null } = {
            userId: editing.userId,
            displayName: trimmed,
            email,
        }
        if (discordChanged) input.discordId = discordId
        update.mutate(input, { onSuccess: () => setEditing(null) })
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

    if (players.isPending) return <ListSkeleton />
    if (players.isError) return <ErrorPanel message={errorMessage(players.error)} />

    const rows = players.data.items
    const enrolledSomewhere = rows.filter((row) => row.enrollments.length > 0).length

    let rosterHint = `${rows.length} tài khoản · ${enrolledSomewhere} ghi danh ít nhất một giải — thí sinh tự xuất hiện ở đây khi đăng nhập Google.`
    if (rows.length === 0) rosterHint = "Chưa có tài khoản nào."
    let deskError: ReactNode = null
    if (update.isError) {
        if (!editing) {
            deskError = (
                <p role="alert" className="px-6 pb-4 text-sm text-destructive">{update.error.message}</p>
            )
        }
    }
    let saveLabel = "Lưu"
    if (update.isPending) saveLabel = "Saving…"
    let enrollLabel = "Ghi danh"
    if (enroll.isPending) enrollLabel = "Đang ghi danh…"
    let leaveLabel = "Bỏ"
    if (leave.isPending) leaveLabel = "Đang bỏ…"

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Thí sinh</CardTitle>
                <CardDescription>
                    {rosterHint}
                </CardDescription>
                <CardAction>
                    <span className="text-xs text-muted-foreground">
                        Ghi danh từng người vào giải ở cột Actions
                    </span>
                </CardAction>
            </CardHeader>

            <CardContent className="p-0">
                {deskError}

                {rows.length === 0 && (
                    <p className="px-6 pb-6 text-sm text-muted-foreground">
                        Thí sinh vào danh sách này ngay khi họ đăng nhập Google — không cần tạo tài khoản ở đây.
                    </p>
                )}
                {rows.length > 0 && (
                    <PlayersTable
                        rows={rows}
                        tournamentsPending={tournaments.isPending}
                        openFor={openFor}
                        onEdit={startEdit}
                        onEnroll={openEnroll}
                        onLeave={openLeave}
                    />
                )}
            </CardContent>

            {editing && (
                <EditPlayerDialog
                    editName={editName}
                    editEmail={editEmail}
                    editDiscord={editDiscord}
                    saveLabel={saveLabel}
                    updatePending={update.isPending}
                    updateError={update.isError ? update.error.message : null}
                    onNameChange={setEditName}
                    onEmailChange={setEditEmail}
                    onDiscordChange={setEditDiscord}
                    onClose={() => setEditing(null)}
                    onSubmit={save}
                />
            )}

            {enrolling && (
                <EnrollDialog
                    player={enrolling}
                    options={openFor(enrolling)}
                    enrollTournament={enrollTournament}
                    enrollLabel={enrollLabel}
                    enrollPending={enroll.isPending}
                    enrollError={enroll.isError ? enroll.error.message : null}
                    tournamentsPending={tournaments.isPending}
                    onTournamentChange={setEnrollTournament}
                    onClose={closeDialogs}
                    onSubmit={submitEnroll}
                />
            )}

            {leaving && (
                <LeaveDialog
                    player={leaving}
                    leaveTournament={leaveTournament}
                    leaveLabel={leaveLabel}
                    leavePending={leave.isPending}
                    leaveError={leave.isError ? leave.error.message : null}
                    onTournamentChange={setLeaveTournament}
                    onClose={closeDialogs}
                    onSubmit={submitLeave}
                />
            )}
        </Card>
    )
}
