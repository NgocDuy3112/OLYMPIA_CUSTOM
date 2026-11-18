import { HINT_TILES, hintTileClass } from "./cells"
import { pt } from "./geometry"

export function HintBars({ tiles, openTile, pickedTiles, verdicts, answers, onPick }: {
    tiles?: Array<string | null>
    openTile?: number | null
    pickedTiles: readonly number[]
    verdicts: Record<string, string>
    answers: Record<string, string>
    onPick?: (qid: string) => void
}) {
    const count = tiles?.length ?? HINT_TILES
    return (
        <div
            className="grid gap-x-[2.2cqw] gap-y-[1.1cqw]"
            style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}
        >
            {Array.from({ length: count }, (_, index) => {
                const qid = tiles ? tiles[index] ?? null : null

                const verdict = verdicts[String(index)]
                if (verdict === "INCORRECT") {
                    return (
                        <div
                            key={index}
                            className="flex h-[75px] items-center justify-center gap-[1cqw] px-[1.2cqw] bg-muted text-muted-foreground/40 ring-1 ring-border"
                            style={{ fontSize: pt(28) }}
                        >
                            <span>{index + 1}</span>
                        </div>
                    )
                }

                const answer = answers[String(index)]
                if (answer !== undefined) {
                    return (
                        <div
                            key={index}
                            className="flex h-[75px] items-center justify-center gap-[1cqw] px-[1.2cqw] bg-card ring-1 ring-border"
                        >
                            <span
                                className="text-center font-sans font-semibold leading-tight break-words whitespace-pre-line text-foreground"
                                style={{ fontSize: pt(16) }}
                            >
                                {answer}
                            </span>
                        </div>
                    )
                }

                const absent = tiles !== undefined && qid === null
                const picked = pickedTiles.includes(index)
                const state = absent ? "absent" : index === openTile ? "open" : picked ? "used" : "free"
                const interactive = Boolean(onPick) && qid !== null && state === "free"
                let title: string | undefined
                if (interactive) title = "Mở gợi ý"
                return (
                    <div
                        key={index}
                        role={interactive ? "button" : undefined}
                        tabIndex={interactive ? 0 : undefined}
                        title={title}
                        onClick={interactive && qid ? () => onPick!(qid) : undefined}
                        onKeyDown={interactive && qid
                            ? (event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                    event.preventDefault()
                                    onPick!(qid)
                                }
                            }
                            : undefined}
                        className={`flex h-[75px] items-center justify-center gap-[1cqw] px-[1.2cqw] ${hintTileClass(state as "open" | "used" | "free" | "absent", interactive)}`}
                        style={{ fontSize: pt(28) }}
                    >
                        <span>{index + 1}</span>
                    </div>
                )
            })}
        </div>
    )
}
