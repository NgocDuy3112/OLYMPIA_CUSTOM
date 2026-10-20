import type { ReactNode } from "react"
import { AlertTriangle, type LucideIcon } from "lucide-react"
import { cn } from "cn"

export function Page({ children, className }: { children: ReactNode; className?: string }) {
    return (
        <div className={cn("mx-auto flex w-full max-w-5xl flex-col gap-6 p-6", className)}>
            {children}
        </div>
    )
}

export function PageHeader({
    title,
    description,
    actions,
}: {
    title: string
    description?: string
    actions?: ReactNode
}) {
    return (
        <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
                <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
                <p className="text-sm text-muted-foreground">{description ?? "\u00a0"}</p>
            </div>
            {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
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

export function ErrorPanel({ message }: { message: string }) {
    return (
        <div
            role="alert"
            className="m-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
        >
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>{message}</span>
        </div>
    )
}