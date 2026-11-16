import { useState, type KeyboardEvent, type ReactNode } from "react"
import { DECK_PAD, pt } from "./geometry"
import { Badges, CardHeader, MainCard } from "./primitives"

const buildRevealProps = (onReveal?: () => void) => {
    if (!onReveal) return {}
    return {
        role: "button",
        tabIndex: 0,
        "aria-label": "Mở câu hỏi",
        title: "Nhấn để mở câu hỏi",
        onClick: onReveal,
        onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault()
                onReveal()
            }
        },
    }
}

export function QuestionBlock({ question, media, mediaHint = "hình ảnh câu hỏi", onReveal }: {
    question: string | null
    media?: { url: string; type: string } | null
    mediaHint?: string
    onReveal?: () => void
}) {
    const revealProps = buildRevealProps(onReveal)
    let mediaPad = ""
    if (media) mediaPad = "pr-[1.2cqw]"
    let revealCls = ""
    if (onReveal) revealCls = "cursor-pointer rounded-xl ring-1 ring-transparent transition hover:ring-primary/40"
    let questionWidth = "flex-1"
    if (media) questionWidth = "w-[26.7cqw] shrink-0"
    return (
        <div
            className={`flex min-h-0 flex-1 items-stretch gap-[1.4cqw] ${mediaPad} ${revealCls}`}
            {...revealProps}
        >
            <p
                className={`min-w-0 font-sans font-medium leading-snug text-foreground ${questionWidth}`}
                style={{ fontSize: pt(14), ...DECK_PAD }}
            >
                {question ?? ""}
            </p>
            {media && <MediaWell media={media} mediaHint={mediaHint} />}
        </div>
    )
}

function MediaWell({ media, mediaHint }: { media: { url: string; type: string }; mediaHint: string }) {
    const [broken, setBroken] = useState(false)
    const wellClass =
        "ml-auto shrink-0 self-center overflow-hidden rounded-2xl bg-muted ring-1 ring-border"

    if (media.type !== "image" || broken) {
        let mediaText = `media: ${media.type}`
        if (broken) mediaText = mediaHint
        return (
            <div className={`${wellClass} flex max-w-[37.4cqw] items-center justify-center px-[2cqw] py-[1.4cqw]`}>
                <span className="font-sans text-muted-foreground" style={{ fontSize: pt(12) }}>
                    {mediaText}
                </span>
            </div>
        )
    }

    return (
        <div className={wellClass}>
            <img
                src={media.url}
                alt=""
                className="block max-h-[30cqw] max-w-[37.4cqw] object-contain"
                onError={() => setBroken(true)}
            />
        </div>
    )
}

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

export function QuestionCard({ round, mode, size, mid, right, question, media, face, onReveal, className, children }: {
    round: string
    mode?: string
    size?: number
    mid?: ReactNode
    right?: ReactNode
    question?: string | null
    media?: { url: string; type: string } | null
    face?: ReactNode
    onReveal?: () => void
    className?: string
    children?: ReactNode
}) {
    return (
        <MainCard className={className}>
            <CardHeader
                left={<Badges round={round} mode={mode} size={size} />}
                mid={mid}
                right={right}
            />
            {children ?? <QuestionBlock question={question ?? null} media={media} onReveal={onReveal} />}
            {face}
        </MainCard>
    )
}

export function AudienceFace({ options }: { options: Array<{ id: string; text: string }> }) {
    if (options.length === 0) return null
    return (
        <div className="flex shrink-0 flex-col gap-[0.5cqw] rounded-xl bg-muted/60 px-[1.4cqw] py-[0.9cqw] ring-1 ring-border">
            <span
                className="font-sans font-bold uppercase tracking-wide text-muted-foreground"
                style={{ fontSize: pt(11) }}
            >
                Khán giả chọn
            </span>
            <div className="grid grid-cols-2 gap-[0.6cqw] sm:grid-cols-4">
                {options.map((option, index) => (
                    <span
                        key={option.id}
                        className="flex items-center justify-center gap-[0.5cqw] rounded-lg bg-background px-[0.8cqw] py-[0.6cqw] text-center font-sans font-semibold text-foreground ring-1 ring-border"
                        style={{ fontSize: pt(12) }}
                    >
                        <b>{String.fromCharCode(65 + index)}.</b>
                        <span className="min-w-0 truncate">{option.text}</span>
                    </span>
                ))}
            </div>
        </div>
    )
}
