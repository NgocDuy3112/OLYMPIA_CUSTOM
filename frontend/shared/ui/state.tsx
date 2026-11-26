import type { ReactNode } from "react"
import { AlertTriangle, type LucideIcon } from "lucide-react"

export function LoadingState({ label = "Đang tải" }: { label?: string }) {
    return (
        <div
            role="status"
            aria-label={label}
            className="mx-auto w-full max-w-360 px-4 py-6 md:py-10"
        >
            <div className="h-96 animate-pulse rounded-xl bg-muted" />
        </div>
    )
}

export function EmptyState({
    icon: Icon,
    title,
    description,
    action,
}: {
    icon: LucideIcon
    title: string
    description: string
    action?: ReactNode
}) {
    return (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed px-6 py-14 text-center">
            <div className="flex size-11 items-center justify-center rounded-full bg-muted">
                <Icon className="size-5 text-muted-foreground" />
            </div>
            <div className="flex flex-col gap-1">
                <p className="font-medium">{title}</p>
                <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
            </div>
            {action}
        </div>
    )
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
    return (
        <div className="flex flex-col gap-2 p-4">
            {Array.from({ length: rows }).map((_, index) => (
                <div key={index} className="h-9 animate-pulse rounded-md bg-muted" />
            ))}
        </div>
    )
}

export function ErrorPanel({
    message,
    title,
    onRetry,
}: {
    message: string
    title?: string
    onRetry?: () => void
}) {
    return (
        <div
            role="alert"
            className="m-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
        >
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <div className="grid gap-1">
                {title && <p className="font-medium">{title}</p>}
                <span>{message}</span>
                {onRetry && (
                    <button
                        type="button"
                        onClick={onRetry}
                        className="w-fit rounded-md border border-destructive/40 px-3 py-1.5 text-sm transition-colors hover:bg-destructive/10"
                    >
                        Thử lại
                    </button>
                )}
            </div>
        </div>
    )
}
