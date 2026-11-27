import type { ReactNode } from "react"
import { Pencil, Trash2, UserPlus } from "lucide-react"
import { Badge } from "@shared/ui/badge"
import { Button } from "@shared/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@shared/ui/table"
import type { PlayerRow } from "@/lib/players"

export function PlayersTable({
    rows,
    tournamentsPending,
    openFor,
    onEdit,
    onEnroll,
    onLeave,
}: {
    rows: PlayerRow[]
    tournamentsPending: boolean
    openFor: (row: PlayerRow) => { id: string }[]
    onEdit: (row: PlayerRow) => void
    onEnroll: (row: PlayerRow) => void
    onLeave: (row: PlayerRow) => void
}) {
    const actions = (row: PlayerRow): ReactNode => {
        const canEnroll = openFor(row).length > 0
        return (
            <>
                <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onEdit(row)}
                    title="Sửa tên / email / Discord"
                >
                    <Pencil className="size-3.5" />
                    Sửa
                </Button>
                <Button
                    size="sm"
                    variant="ghost"
                    disabled={!canEnroll || tournamentsPending}
                    onClick={() => onEnroll(row)}
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
                    onClick={() => onLeave(row)}
                    title="Rời một giải (từ chối nếu đã thi đấu)"
                >
                    <Trash2 className="size-3.5" />
                    Bỏ
                </Button>
            </>
        )
    }

    return (
        <Table className="min-w-[52rem]">
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
                {rows.map((row) => {
                    let discordCell: ReactNode = (
                        <span
                            className="text-sm text-muted-foreground"
                            title="Chưa có ID Discord — bấm Sửa để lưu (dán ID, mention hoặc link đều được)."
                        >
                            chưa liên kết
                        </span>
                    )
                    if (row.discordId) {
                        discordCell = (
                            <span
                                className="font-mono text-xs"
                                title={`Discord ID ${row.discordId}`}
                            >
                                {row.discordId}
                            </span>
                        )
                    }
                    return (
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
                            {discordCell}
                        </TableCell>
                        <TableCell>
                            {row.enrollments.length === 0 && (
                                <span className="text-sm text-muted-foreground">
                                    chưa ghi danh giải nào
                                </span>
                            )}
                            {row.enrollments.length > 0 && (
                                <span className="flex flex-wrap gap-1">
                                    {row.enrollments.map((entry) => {
                                        let currentTag = ""
                                        if (entry.current) currentTag = " · current"
                                        return (
                                            <Badge key={entry.tournamentId} variant="secondary">
                                                {entry.name}
                                                {currentTag}
                                            </Badge>
                                        )
                                    })}
                                </span>
                            )}
                        </TableCell>
                        <TableCell className="pr-6 text-right">
                            <span className="flex flex-wrap justify-end gap-1">
                                {actions(row)}
                            </span>
                        </TableCell>
                    </TableRow>
                    )
                })}
            </TableBody>
        </Table>
    )
}
