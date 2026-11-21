import { Button } from "@shared/ui/button"
import { PAGE_SIZE } from "./model"

export function Pagination({ total, page, busy, onChange }: {
    total: number
    page: number
    busy: boolean
    onChange: (page: number) => void
}) {
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
    if (pages <= 1) return null
    const atStart = page <= 1
    const atEnd = page >= pages
    return (
        <div className="flex items-center justify-end gap-2">
            <p className="text-xs text-muted-foreground">
                Trang {page} / {pages} · {total} câu
            </p>
            <Button variant="outline" size="sm" disabled={atStart || busy} onClick={() => onChange(page - 1)}>
                Trước
            </Button>
            <Button variant="outline" size="sm" disabled={atEnd || busy} onClick={() => onChange(page + 1)}>
                Sau
            </Button>
        </div>
    )
}
