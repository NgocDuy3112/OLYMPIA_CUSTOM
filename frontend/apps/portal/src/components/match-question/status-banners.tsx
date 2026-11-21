import { RefreshCw } from "lucide-react"
import { Button } from "@shared/ui/button"

export function StatusBanners({
    conflict,
    saveError,
    flash,
    notice,
    onSave,
}: {
    conflict: string | null
    saveError: string | null
    flash: string | null
    notice: string | null
    onSave: () => void
}) {
    return (
        <>
            {conflict && (
                <p role="alert" className="flex flex-wrap items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    <RefreshCw className="size-3.5 shrink-0" />
                    {conflict} Trận vừa được lưu ở nơi khác — bấm Lưu sẽ ghi đè bản mới, nên
                    soi lại danh sách trước.
                    <Button variant="outline" size="sm" onClick={onSave}>
                        Vẫn lưu
                    </Button>
                </p>
            )}
            {saveError && (
                <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    {saveError}
                </p>
            )}
            {flash && (
                <p className="rounded-lg border px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                    {flash}
                </p>
            )}
            {notice && (
                <p className="rounded-lg border border-emerald-600/40 bg-emerald-500/10 px-3 py-2 text-xs">
                    ✓ {notice}
                </p>
            )}
        </>
    )
}
