import { RefreshCw } from "lucide-react"
import { Button } from "@shared/ui/button"

const BANNER = "flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-xs"
const DANGER = `${BANNER} border-destructive/40 bg-destructive/10 text-destructive`
const WARN = `${BANNER} border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300`
const OK = `${BANNER} border-emerald-600/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300`

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
                <p role="alert" className={DANGER}>
                    <RefreshCw className="size-3.5 shrink-0" aria-hidden />
                    {conflict} Trận vừa được lưu ở nơi khác — bấm Lưu sẽ ghi đè bản mới, nên
                    soi lại danh sách trước.
                    <Button variant="outline" size="sm" onClick={onSave}>
                        Vẫn lưu
                    </Button>
                </p>
            )}
            {saveError && (
                <p role="alert" className={DANGER}>
                    {saveError}
                </p>
            )}
            {flash && (
                <p role="status" aria-live="polite" className={WARN}>
                    {flash}
                </p>
            )}
            {notice && (
                <p role="status" aria-live="polite" className={OK}>
                    ✓ {notice}
                </p>
            )}
        </>
    )
}
