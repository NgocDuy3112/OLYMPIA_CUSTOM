import type { ReactNode } from "react"
import { Pencil, Upload, X } from "lucide-react"
import { Button } from "@shared/ui/button"

export function HeaderActions({
    matchStatus,
    editable,
    statusText,
    savePending,
    onEnterCompose,
    onLeaveCompose,
    onOpenImport,
}: {
    matchStatus: string
    editable: boolean
    statusText: string
    savePending: boolean
    onEnterCompose: () => void
    onLeaveCompose: () => void
    onOpenImport: () => void
}) {
    let headerActions: ReactNode = (
        <span className="text-xs text-muted-foreground">
            Chỉ sửa được khi trận còn UPCOMING
        </span>
    )
    if (matchStatus === "UPCOMING") {
        headerActions = (
            <>
                <Button variant="outline" size="sm" onClick={onOpenImport}>
                    <Upload className="size-3.5" /> Nhập đề
                </Button>
                <Button variant="outline" size="sm" onClick={onEnterCompose}>
                    <Pencil className="size-3.5" /> Sửa câu hỏi
                </Button>
            </>
        )
    }
    if (editable) {
        headerActions = (
            <>
                <span aria-live="polite" className="text-xs text-muted-foreground">
                    {statusText}
                </span>
                <Button variant="ghost" size="sm" onClick={onLeaveCompose} disabled={savePending}>
                    <X className="size-4" /> Xong
                </Button>
            </>
        )
    }
    return <div className="ml-auto flex items-center gap-2">{headerActions}</div>
}
