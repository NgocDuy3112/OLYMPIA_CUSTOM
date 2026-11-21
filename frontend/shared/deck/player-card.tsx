import type { ReactNode } from "react"
import { initialsOf, pt } from "./geometry"

export function PlayerAvatar({ name, className, children }: {
    name: string
    className: string
    children?: ReactNode
}) {
    return (
        <div
            className={`relative flex w-[52%] shrink-0 items-center justify-center rounded-lg font-display font-bold ${className}`}
            style={{ fontSize: pt(16) }}
        >
            <span aria-hidden>{initialsOf(name)}</span>
            {children}
        </div>
    )
}
