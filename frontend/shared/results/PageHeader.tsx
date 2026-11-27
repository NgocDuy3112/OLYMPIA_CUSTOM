import type { ReactNode } from "react"

export function PageHeader({ title, description, actions }: {
    title: string
    description?: string
    actions?: ReactNode
}) {
    return (
        <header className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-1">
                <h1 className="font-heading text-2xl font-bold md:text-3xl">{title}</h1>
                {description && (
                    <p className="text-sm text-muted-foreground">{description}</p>
                )}
            </div>
            {actions && (
                <div className="flex items-center gap-2">{actions}</div>
            )}
        </header>
    )
}
