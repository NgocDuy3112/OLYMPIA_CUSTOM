// The question side of the card: the text, its media well, and the whole
// "question card" assembly both surfaces were building by hand — Badges +
// timer/progress on the right, the text, the media.
//
// QuestionFrame is the deduplication that matters: five controller screens and
// five player screens drew the identical MainCard/CardHeader/QuestionBlock
// stack, so a fix to the media well or the placeholder had to be made ten
// times.
import { useState, type ReactNode } from "react"
import { DECK_PAD, pt } from "./geometry"
import { Badges, CardHeader, MainCard } from "./primitives"
import { COPY } from "./copy"

/**
 * The question TEXT takes the whole card when there is no media (no empty gray
 * well for nothing); with media, the well hugs the image's natural aspect
 * (horizontal images span the row, vertical ones stay narrow instead of
 * pillarboxing), is always aligned to the RIGHT of the card with breathing room
 * (right padding only when media exists), and a broken URL falls back to the
 * placeholder rather than a torn icon.
 */
export function QuestionBlock({ question, media, mediaHint = "hình ảnh câu hỏi" }: {
    question: string | null
    media?: { url: string; type: string } | null
    mediaHint?: string
}) {
    return (
        <div className={`flex min-h-0 flex-1 items-stretch gap-[1.4cqw] ${media ? "pr-[1.2cqw]" : ""}`}>
            <p
                className={`min-w-0 font-sans font-medium leading-snug text-foreground ${media ? "w-[26.7cqw] shrink-0" : "flex-1"}`}
                style={{ fontSize: pt(14), ...DECK_PAD }}
            >
                {question ?? COPY.waitingForMc}
            </p>
            {media && <MediaWell media={media} mediaHint={mediaHint} />}
        </div>
    )
}

function MediaWell({ media, mediaHint }: { media: { url: string; type: string }; mediaHint: string }) {
    const [natural, setNatural] = useState<{ w: number; h: number } | null>(null)
    const [broken, setBroken] = useState(false)

    // Audio/video (or a broken link): a modest labeled well — the deck never
    // plays media inline; the show surface does.
    if (media.type !== "image" || broken) {
        return (
            <div className="ml-auto flex h-full w-[37.4cqw] shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-muted ring-1 ring-border">
                <span className="font-sans text-muted-foreground" style={{ fontSize: pt(12) }}>
                    {broken ? mediaHint : `media: ${media.type}`}
                </span>
            </div>
        )
    }

    // Image: the well tracks the natural aspect (16:9 until it loads) and never
    // exceeds the row — width clamps, the img contains inside it.
    return (
        <div
            className="ml-auto flex shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-muted ring-1 ring-border"
            style={{ height: "100%", aspectRatio: natural ? `${natural.w} / ${natural.h}` : "16 / 9", maxWidth: "100%" }}
        >
            <img
                src={media.url}
                alt=""
                className="max-h-full max-w-full object-contain"
                onLoad={(event) => {
                    const { naturalWidth: w, naturalHeight: h } = event.currentTarget
                    if (w > 0 && h > 0) setNatural({ w, h })
                }}
                onError={() => setBroken(true)}
            />
        </div>
    )
}

/**
 * Giải mã's public clue: "Mật mã gồm có N chữ cái" — above the tiles on both
 * surfaces, so the length is announced identically to the console and the field.
 */
export function KeywordLengthBanner({ length }: { length: number | null }) {
    if (length === null) return null
    return (
        <div className="flex shrink-0 items-center justify-center rounded-2xl bg-card px-[2cqw] py-[0.7cqw] shadow-md ring-1 ring-border">
            <span className="font-display font-bold uppercase tracking-wide text-foreground" style={{ fontSize: pt(32) }}>
                Mật mã gồm có {length} chữ cái
            </span>
        </div>
    )
}

/**
 * The whole question card: the round badge (clickable on the console's deck), the
 * optional middle chips, the clock/progress on the right, then the question
 * itself. Screens that need a different body (giai-ma's hint grid, the vé-đích
 * board) build their own MainCard — this is for the five that don't.
 */
export function QuestionFrame({ round, mode, size, onRoundClick, mid, right, question, media }: {
    round: string
    mode?: string
    size?: number
    onRoundClick?: () => void
    mid?: ReactNode
    right?: ReactNode
    question: string | null
    media?: { url: string; type: string } | null
}) {
    return (
        <MainCard>
            <CardHeader
                left={<Badges round={round} mode={mode} size={size} onRoundClick={onRoundClick} />}
                mid={mid}
                right={right}
            />
            <QuestionBlock question={question} media={media} />
        </MainCard>
    )
}
