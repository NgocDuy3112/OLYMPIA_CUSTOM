import { Input } from "@shared/ui/input"
import { BankPickerItem } from "@/components/compose-group"
import { badgeOfRow, bucketOfRow, messageOf, type BankRow, type Entry, type TabDef } from "./model"

export function BankPickerPane({
    tab,
    search,
    onSearchChange,
    pickerRows,
    total,
    isPending,
    isError,
    error,
    shown,
    onAdd,
}: {
    tab: TabDef
    search: string
    onSearchChange: (value: string) => void
    pickerRows: BankRow[]
    total: number | undefined
    isPending: boolean
    isError: boolean
    error: unknown
    shown: Record<string, Entry[]>
    onAdd: (sourceId: string, bucket: string, index: number) => void
}) {
    return (
        <aside className="grid content-start gap-3 rounded-lg border bg-card p-3">
            <div className="grid gap-2">
                <span className="text-sm font-semibold">Ngân hàng · {tab.label}</span>
                <Input
                    value={search}
                    onChange={(event) => onSearchChange(event.target.value)}
                    placeholder="tìm câu hỏi…"
                    className="h-8"
                    aria-label="Tìm trong ngân hàng"
                />
                <span className="text-xs text-muted-foreground">
                    {(() => {
                        let pageNote = ""
                        const totalValue = total ?? 0
                        if (totalValue > 200) pageNote = " (trang đầu)"
                        let pickerCount = `${total ?? pickerRows.length} câu PUBLISHED${pageNote}`
                        if (isPending) pickerCount = "Đang tải…"
                        return pickerCount
                    })()}
                </span>
            </div>
            <ul className="grid max-h-[26rem] gap-1 overflow-y-auto">
                {pickerRows.map((row) => {
                    const rowBucket = bucketOfRow(row)
                    let secondary: string | undefined = undefined
                    if (rowBucket) secondary = rowBucket
                    let target: string | undefined = undefined
                    if (rowBucket) {
                        if (tab.groups.some((g) => g.bucket === rowBucket)) target = rowBucket
                    }
                    if (!target) target = tab.groups[0]?.bucket
                    return (
                        <BankPickerItem
                            key={row.id}
                            sourceId={row.id}
                            primary={row.questionText}
                            typeBadge={badgeOfRow(row)}
                            secondary={secondary}
                            onClick={() => {
                                if (target) onAdd(row.id, target, (shown[target] ?? []).length)
                            }}
                        />
                    )
                })}
                {isError && (
                    <li className="text-xs text-destructive">{messageOf(error)}</li>
                )}
                {pickerRows.length === 0 && !isPending && !isError && (
                    <li className="rounded-md border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
                        Không có câu phù hợp nhóm này.
                    </li>
                )}
            </ul>
        </aside>
    )
}
