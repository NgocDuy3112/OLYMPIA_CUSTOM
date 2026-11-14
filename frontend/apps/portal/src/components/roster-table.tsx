import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@shared/ui/table"
import type { ContestantRow } from "@/lib/tournament"

/** The roster table — read-only, for the tournament's Thí sinh tab. Every tool
 *  lives on the global desk at /players. */
export function RosterTable({ rows }: { rows: ContestantRow[] }) {
    return (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead className="pl-6">Contestant</TableHead>
                    <TableHead className="w-28">Nhóm</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead className="w-36">Discord</TableHead>
                    <TableHead className="w-6 pr-6" />
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
                                    title="Chưa có ID Discord — sửa ở trang Thí sinh (dán ID, mention hoặc link đều được)."
                                >
                                    chưa liên kết
                                </span>
                            )}
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    )
}
