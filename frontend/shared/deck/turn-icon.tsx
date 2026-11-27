import { Star, Swords } from "lucide-react"
import { TYPE, pt } from "./geometry"

export type TurnIconKind = "star" | "swords"

export function TurnIcon({ kind }: { kind: TurnIconKind }) {
    let Icon = Star
    let label = "Ngôi sao hy vọng"
    let tone = "text-(--warning) fill-(--warning)"
    if (kind === "swords") {
        Icon = Swords
        label = "Lượt chỉ định"
        tone = "text-(--success)"
    }
    return (
        <span
            role="img"
            aria-label={label}
            title={label}
            className="icon-pop inline-flex shrink-0 items-center justify-center"
            style={{ fontSize: pt(TYPE.bodySm) }}
        >
            <Icon className={`size-[1.15em] icon-throb ${tone}`} aria-hidden />
        </span>
    )
}
