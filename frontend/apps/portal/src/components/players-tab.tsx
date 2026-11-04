import { useState, type FormEvent } from "react"
import { KeyRound, Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react"
import { Button } from "@shared/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@shared/ui/card"
import { Input } from "@shared/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@shared/ui/table"
import {
    useActivateContestant,
    useContestants,
    useIssueEntryCode,
    useRemoveContestant,
    useUpdateContestant,
    type ContestantRow,
} from "@/lib/tournament"
import { AddContestantDialog } from "./add-contestant-dialog"

/**
 * How many minutes the code on screen still lives. The desk reads it out loud
 * and the clock is the honest half of the sentence: a code that outlives its
 * claim on the room is exactly what rotation exists to prevent.
 */
function minutesLeft(iso: string): number {
    return Math.max(1, Math.ceil((new Date(iso).getTime() - Date.now()) / 60_000))
}

/**
 * Thí sinh — the roster, and the only place a contestant is created or corrected.
 *
 * It lists and nothing else: a name, the account it belongs to (or "chưa có"), and
 * three actions. Group membership belongs to the Groups tab (that tab is the
 * DRAW); scores belong to Standings.
 *
 * The EMAIL is the load-bearing field, and there are two ways a row gets one:
 * the player registered THEIR OWN account (the operator enrolls the address,
 * never a password), or the operator attaches an address to a show-floor
 * identity so the player's own sign-in finds this row and attaches to it —
 * nothing moves, because nothing was anywhere else.
 */
export function PlayersTab({ tournamentId, frozen }: { tournamentId: string; frozen: boolean }) {
    const roster = useContestants(tournamentId)
    const update = useUpdateContestant(tournamentId)
    const remove = useRemoveContestant(tournamentId)
    const activate = useActivateContestant(tournamentId)
    const issueCode = useIssueEntryCode(tournamentId)

    /** Adding is a dialog, like every other create on this page. */
    const [adding, setAdding] = useState(false)
    /** The row being edited (null: no row chosen). One panel, so never two forms at once. */
    const [editing, setEditing] = useState<ContestantRow | null>(null)
    const [editName, setEditName] = useState("")
    const [editEmail, setEditEmail] = useState("")
    /** An entry code just issued — shown ONCE, to the operator who asked for it. */
    const [issued, setIssued] = useState<{ displayName: string; code: string; expiresAt: string } | null>(null)

    const startEdit = (row: ContestantRow) => {
        setEditing(row)
        setEditName(row.displayName)
        setEditEmail(row.email ?? "")
        update.reset()
        remove.reset()
    }

    const save = (event: FormEvent) => {
        event.preventDefault()
        if (!editing || update.isPending) return
        const trimmed = editName.trim()
        if (!trimmed) return
        const address = editEmail.trim()
        update.mutate(
            {
                userId: editing.userId,
                displayName: trimmed,
                // "" detaches the address: back to a show-floor identity
                email: address === "" ? null : address,
            },
            { onSuccess: () => setEditing(null) }
        )
    }

    const drop = (row: ContestantRow) => {
        remove.mutate(row.userId)
    }

    /** The desk vouches for the address: the player can log in now. */
    const verify = (row: ContestantRow) => {
        setIssued(null)
        activate.mutate(row.userId)
    }

    /** Forgotten password: one code, this player, one use — no password held. */
    const giveEntryCode = (row: ContestantRow) => {
        activate.reset()
        issueCode.mutate(row.userId, {
            onSuccess: (data) => setIssued({ displayName: row.displayName, ...data }),
        })
    }

    if (roster.isPending) return <p className="text-sm text-muted-foreground">Loading the roster…</p>
    if (roster.isError) return <p role="alert" className="text-sm text-destructive">{roster.error.message}</p>

    const rows = roster.data.items
    const withAccount = rows.filter((row) => row.email !== null).length

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Thí sinh</CardTitle>
                <CardDescription>
                    {rows.length === 0
                        ? "No contestants yet — add the first one."
                        : `${rows.length} contestant${rows.length === 1 ? "" : "s"} · ${withAccount} with an account, ${rows.length - withAccount} show-floor only.`}
                </CardDescription>
                <CardAction>
                    <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
                        <Plus className="size-3.5" />
                        Thêm thí sinh
                    </Button>
                </CardAction>
            </CardHeader>

            <CardContent className="p-0">
                {remove.isError ? (
                    <p role="alert" className="px-6 pb-4 text-sm text-destructive">{remove.error.message}</p>
                ) : null}
                {activate.isError ? (
                    <p role="alert" className="px-6 pb-4 text-sm text-destructive">{activate.error.message}</p>
                ) : null}
                {issueCode.isError ? (
                    <p role="alert" className="px-6 pb-4 text-sm text-destructive">{issueCode.error.message}</p>
                ) : null}

                {/* The code exists to be READ OUT and then forgotten: it is on
                    screen once, with its clock, and nowhere else. */}
                {issued ? (
                    <div
                        role="status"
                        className="mb-4 flex items-center justify-between gap-3 rounded-md border border-border bg-muted px-6 py-3"
                    >
                        <p className="font-sans text-sm">
                            <span className="text-muted-foreground">Mã vào cho</span>{" "}
                            <b>{issued.displayName}</b>:{" "}
                            <b className="font-mono tracking-widest">{issued.code}</b>{" "}
                            <span className="text-xs text-muted-foreground">
                                — dùng một lần, hết hạn sau {minutesLeft(issued.expiresAt)} phút.
                            </span>
                        </p>
                        <Button size="sm" variant="ghost" onClick={() => setIssued(null)}>
                            Đóng
                        </Button>
                    </div>
                ) : null}

                {rows.length === 0 ? (
                    <p className="px-6 pb-6 text-sm text-muted-foreground">
                        A match seats players from this roster — add them here first.
                    </p>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="pl-6">Contestant</TableHead>
                                <TableHead className="w-28">Nhóm</TableHead>
                                <TableHead>Account</TableHead>
                                <TableHead className="w-80 pr-6 text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {rows.map((row) => (
                                <TableRow key={row.userId}>
                                    <TableCell className="pl-6 font-medium">{row.displayName}</TableCell>
                                    <TableCell>
                                        {row.group ? (
                                            <span className="text-sm">Nhóm {row.group}</span>
                                        ) : (
                                            <span
                                                className="text-sm text-muted-foreground"
                                                title="Chưa xếp nhóm — kéo vào Nhóm A/B ở tab Groups."
                                            >
                                                chưa xếp
                                            </span>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        {row.email ? (
                                            <span className="text-sm">{row.email}</span>
                                        ) : (
                                            <span
                                                className="text-sm text-muted-foreground"
                                                title="Không có email: thí sinh chỉ thi tại chỗ, không đăng nhập được nên không giữ được lịch sử khi tự đăng nhập."
                                            >
                                                chưa có tài khoản
                                            </span>
                                        )}
                                    </TableCell>
                                    <TableCell className="pr-6 text-right">
                                        <span className="flex flex-wrap justify-end gap-1">
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => startEdit(row)}
                                                title="Sửa tên / email"
                                            >
                                                <Pencil className="size-3.5" />
                                                Sửa
                                            </Button>
                                            {row.email && !row.emailVerified ? (
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    disabled={activate.isPending}
                                                    onClick={() => verify(row)}
                                                    title="Xác thực tài khoản để thí sinh đăng nhập được (ban điều hành xác nhận địa chỉ)"
                                                >
                                                    <ShieldCheck className="size-3.5" />
                                                    Xác thực
                                                </Button>
                                            ) : null}
                                            {row.email ? (
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    disabled={issueCode.isPending}
                                                    onClick={() => giveEntryCode(row)}
                                                    title="Quên mật khẩu: cấp mã một lần cho thí sinh — bàn điều hành không giữ mật khẩu"
                                                >
                                                    <KeyRound className="size-3.5" />
                                                    {issueCode.isPending && issueCode.variables === row.userId
                                                        ? "Đang cấp…"
                                                        : "Mã vào"}
                                                </Button>
                                            ) : null}
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                className="text-destructive"
                                                disabled={remove.isPending}
                                                onClick={() => drop(row)}
                                                title="Bỏ khỏi giải (từ chối nếu đã thi đấu)"
                                            >
                                                <Trash2 className="size-3.5" />
                                                Bỏ
                                            </Button>
                                        </span>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </CardContent>

            {adding ? (
                <AddContestantDialog
                    tournamentId={tournamentId}
                    open
                    onOpenChange={(open) => { if (!open) setAdding(false) }}
                />
            ) : null}

            {editing ? (
                <div className="border-t px-6 py-4">
                    <form onSubmit={save} className="flex flex-wrap items-end gap-2">
                        <label className="flex flex-col gap-1">
                            <span className="text-xs text-muted-foreground">Tên</span>
                            <Input
                                value={editName}
                                onChange={(event) => setEditName(event.target.value)}
                                maxLength={100}
                                aria-label="Edit contestant name"
                                className="h-8 w-44"
                            />
                        </label>
                        <label className="flex flex-col gap-1">
                            <span className="text-xs text-muted-foreground">Email (bỏ trống = không có tài khoản)</span>
                            <Input
                                value={editEmail}
                                onChange={(event) => setEditEmail(event.target.value)}
                                type="email"
                                maxLength={255}
                                aria-label="Edit contestant email"
                                className="h-8 w-56"
                            />
                        </label>
                        <Button size="sm" type="submit" disabled={update.isPending || editName.trim().length === 0}>
                            {update.isPending ? "Saving…" : "Lưu"}
                        </Button>
                        <Button size="sm" type="button" variant="ghost" onClick={() => setEditing(null)}>
                            Huỷ
                        </Button>
                        {frozen ? (
                            <p className="text-xs text-muted-foreground">
                                Giải đã đóng: sửa tên vẫn được, nhưng hãy kiểm tra lại bảng điểm.
                            </p>
                        ) : null}
                    </form>
                    {update.isError ? (
                        <p role="alert" className="pt-2 text-sm text-destructive">{update.error.message}</p>
                    ) : null}
                </div>
            ) : null}
        </Card>
    )
}
