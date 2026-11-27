import type { ReactNode } from "react"
import { TYPE, initialsOf, pt } from "./geometry"

export function PlayerAvatar({ name, className, children }: {
    name: string
    className: string
    children?: ReactNode
}) {
    return (
        <div
            className={`relative flex w-[52%] shrink-0 items-center justify-center rounded-lg font-display font-bold ${className}`}
            style={{ fontSize: pt(TYPE.title) }}
        >
            <span aria-hidden>{initialsOf(name)}</span>
            {children}
        </div>
    )
}
