import type { ReactNode } from "react"
import { cn } from "cn"

export { EmptyState, ErrorPanel, ListSkeleton } from "@shared/ui/state"

export function Page({ children, className }: { children: ReactNode; className?: string }) {
    return (
        <div
            className={cn(
                "mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-10",
                className
            )}
        >
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
    description?: ReactNode
    actions?: ReactNode
}) {
    return (
        <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
                <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
                {description && (
                    <p className="text-sm text-muted-foreground">{description}</p>
                )}
            </div>
            {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
    )
}
