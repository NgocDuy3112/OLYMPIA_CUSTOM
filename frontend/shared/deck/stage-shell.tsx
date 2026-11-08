import type { ReactNode } from "react"

export function StageShell({
    children,
    fullHeight = false,
}: {
    children: ReactNode
    fullHeight?: boolean
}) {
    if (fullHeight) {
        return (
            <div className="@container relative min-h-dvh w-full overflow-hidden bg-background">
                {children}
            </div>
        )
    }

    return (
        <div
            className="relative flex w-full flex-1 items-center justify-center overflow-hidden bg-background"
            style={{ containerType: "size" }}
        >
            <div
                className="relative aspect-video overflow-hidden bg-background"
                style={{ width: "min(100cqw, calc(100cqh * 16 / 9))" }}
            >
                <div className="@container relative h-full w-full overflow-hidden">{children}</div>
            </div>
        </div>
    )
}
