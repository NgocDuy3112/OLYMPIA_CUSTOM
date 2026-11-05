import { useState, type FormEvent } from "react"
import { KeyRound, Pencil, Plus, Trash2 } from "lucide-react"
import { Button } from "@shared/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@shared/ui/card"
import { Input } from "@shared/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@shared/ui/table"
import {
    useContestants,
    useRemoveContestant,
    useResetPassword,
    useUpdateContestant,
    type ContestantRow,
} from "@/lib/tournament"
import { AddContestantDialog } from "./add-contestant-dialog"

const PASSWORD_MIN = 8

/**
 * Thí sinh — the roster, and the only place a contestant is created or corrected.
 *
 * It lists and nothing else: the name on the board, the ACCOUNT (handle, address
 * if any, password state), and three actions. Group membership belongs to the
 * Groups tab (that tab is the DRAW); scores belong to Standings.
 *
 * Since step 8 the account column IS the identity: the handle is what this
 * player types at the login form, `hasPassword` says whether they can sign in
 * at all yet, and "chưa đổi mật khẩu" means the desk's FIRST password is still
 * in place — every one of those states ends at the same place, the player
 * setting their own password on their first sign-in.
 */
export function PlayersTab({ tournamentId, frozen }: { tournamentId: string; frozen: boolean }) {
    const roster = useContestants(tournamentId)
    const update = useUpdateContestant(tournamentId)
    const remove = useRemoveContestant(tournamentId)
    const reset = useResetPassword(tournamentId)

    /** Adding is a dialog, like every other create on this page. */
    const [adding, setAdding] = useState(false)
    /** The row being edited (null: no row chosen). One panel, so never two forms at once. */
    const [editing, setEditing] = useState<ContestantRow | null>(null)
    const [editName, setEditName] = useState("")
    const [editEmail, setEditEmail] = useState("")
    /** The row whose password is being (re)set — the other panel, same rule. */
    const [resetting, setResetting] = useState<ContestantRow | null>(null)
    const [newPassword, setNewPassword] = useState("")

    const startEdit = (row: ContestantRow) => {
        setResetting(null)
        setNewPassword("")
        reset.reset()
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
                // "" detaches the address: Google stops finding this row
                email: address === "" ? null : address,
            },
            { onSuccess: () => setEditing(null) }
        )
    }

    const drop = (row: ContestantRow) => {
        remove.mutate(row.userId)
    }

    /** Forgotten password — or a row that never had one (created before step 8). */
    const startReset = (row: ContestantRow) => {
        setEditing(null)
        setResetting(row)
        setNewPassword("")
        reset.reset()
    }

    const savePassword = (event: FormEvent) => {
        event.preventDefault()
        if (!resetting || reset.isPending || newPassword.length < PASSWORD_MIN) return
        reset.mutate(
            { userId: resetting.userId, password: newPassword },
            { onSuccess: () => { setResetting(null); setNewPassword("") } }
        )
    }

    if (roster.isPending) return <p className="text-sm text-muted-foreground">Loading the roster…</p>
    if (roster.isError) return <p role="alert" className="text-sm text-destructive">{roster.error.message}</p>

    const rows = roster.data.items
    const withPassword = rows.filter((row) => row.hasPassword).length
    const changing = rows.filter((row) => row.mustChangePassword).length

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Thí sinh</CardTitle>
                <CardDescription>
                    {rows.length === 0
                        ? "No contestants yet — add the first one."
                        : `${rows.length} contestant${rows.length === 1 ? "" : "s"} · ${withPassword} có mật khẩu, ${rows.length - withPassword} chưa có${changing > 0 ? `, ${changing} chưa đổi mật khẩu` : ""}.`}
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
                {update.isError && !editing ? (
                    <p role="alert" className="px-6 pb-4 text-sm text-destructive">{update.error.message}</p>
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
                                <TableHead className="w-72 pr-6 text-right">Actions</TableHead>
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
                                        <div className="flex flex-col gap-0.5">
                                            <span
                                                className="font-mono text-xs text-muted-foreground"
                                                title="Tên đăng nhập — thí sinh gõ cái này ở trang Đăng nhập"
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
                                            {!row.hasPassword ? (
                                                <span
                                                    className="text-xs text-amber-700"
                                                    title="Dòng này chưa từng có mật khẩu — chỉ đăng nhập Google được, hoặc bấm «Đặt mật khẩu» bên phải."
                                                >
                                                    chưa có mật khẩu
                                                </span>
                                            ) : row.mustChangePassword ? (
                                                <span
                                                    className="text-xs text-amber-700"
                                                    title="Mật khẩu do bạn cấp vẫn còn hiệu lực — thí sinh phải tự đặt mật khẩu riêng ở lần đăng nhập đầu."
                                                >
                                                    chưa đổi mật khẩu
                                                </span>
                                            ) : null}
                                        </div>
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
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => startReset(row)}
                                                title="Quên mật khẩu (hoặc chưa từng có): cấp lại mật khẩu đầu — thí sinh tự đổi ngay lần đăng nhập sau"
                                            >
                                                <KeyRound className="size-3.5" />
                                                Đặt mật khẩu
                                            </Button>
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
                            <span className="text-xs text-muted-foreground">Email (bỏ trống = không có địa chỉ)</span>
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

            {resetting ? (
                <div className="border-t px-6 py-4">
                    <form onSubmit={savePassword} className="flex flex-wrap items-end gap-2">
                        <label className="flex flex-col gap-1">
                            <span className="text-xs text-muted-foreground">
                                Mật khẩu đầu cho {resetting.displayName}
                            </span>
                            <Input
                                value={newPassword}
                                onChange={(event) => setNewPassword(event.target.value)}
                                type="text"
                                autoComplete="off"
                                maxLength={256}
                                minLength={PASSWORD_MIN}
                                placeholder="tối thiểu 8 ký tự"
                                aria-label="New password"
                                className="h-8 w-56"
                            />
                        </label>
                        <Button
                            size="sm"
                            type="submit"
                            disabled={reset.isPending || newPassword.length < PASSWORD_MIN}
                        >
                            {reset.isPending ? "Đang lưu…" : "Cấp lại"}
                        </Button>
                        <Button
                            size="sm"
                            type="button"
                            variant="ghost"
                            onClick={() => { setResetting(null); setNewPassword(""); reset.reset() }}
                        >
                            Huỷ
                        </Button>
                        <p className="text-xs text-muted-foreground">
                            Thí sinh sẽ tự đặt mật khẩu riêng ở lần đăng nhập kế — mọi phiên cũ bằng mật
                            khẩu này đều bị khoá.
                        </p>
                    </form>
                    {reset.isError ? (
                        <p role="alert" className="pt-2 text-sm text-destructive">{reset.error.message}</p>
                    ) : null}
                </div>
            ) : null}
        </Card>
    )
}
