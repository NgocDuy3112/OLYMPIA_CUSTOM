import { useState, type KeyboardEvent, type ReactNode } from "react"
import { DECK_PAD, pt } from "./geometry"
import { Badges, CardHeader, MainCard } from "./primitives"
import { COPY } from "./copy"

export function QuestionBlock({ question, media, mediaHint = "hình ảnh câu hỏi", onReveal }: {
    question: string | null
    media?: { url: string; type: string } | null
    mediaHint?: string
    /** click the card to show the question to everyone */
    onReveal?: () => void
}) {
    const revealProps = onReveal
        ? {
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
        : {}
    return (
        <div
            className={`flex min-h-0 flex-1 items-stretch gap-[1.4cqw] ${media ? "pr-[1.2cqw]" : ""} ${
                onReveal ? "cursor-pointer rounded-xl ring-1 ring-transparent transition hover:ring-primary/40" : ""
            }`}
            {...revealProps}
        >
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

    if (media.type !== "image" || broken) {
        return (
            <div className="ml-auto flex h-full w-[37.4cqw] shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-muted ring-1 ring-border">
                <span className="font-sans text-muted-foreground" style={{ fontSize: pt(12) }}>
                    {broken ? mediaHint : `media: ${media.type}`}
                </span>
            </div>
        )
    }

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

export function AnswerReveal({ answer }: { answer?: string | null }) {
    if (!answer) return null
    return (
        <div className="flex shrink-0 flex-wrap items-baseline gap-x-[1cqw] gap-y-[0.3cqw] rounded-xl bg-emerald-50 px-[1.4cqw] py-[0.8cqw] ring-1 ring-emerald-200">
            <span className="font-sans font-bold uppercase tracking-wide text-emerald-700" style={{ fontSize: pt(12) }}>
                Đáp án
            </span>
            <span className="min-w-0 font-sans font-semibold text-foreground" style={{ fontSize: pt(14) }}>
                {answer}
            </span>
        </div>
    )
}

export function QuestionFrame({ round, mode, size, onRoundClick, mid, right, question, media, answer, face, onReveal }: {
    round: string
    mode?: string
    size?: number
    onRoundClick?: () => void
    mid?: ReactNode
    right?: ReactNode
    question: string | null
    media?: { url: string; type: string } | null
    answer?: string | null
    face?: ReactNode
    /** click the card to show the question to everyone */
    onReveal?: () => void
}) {
    return (
        <MainCard>
            <CardHeader
                left={<Badges round={round} mode={mode} size={size} onRoundClick={onRoundClick} />}
                mid={mid}
                right={right}
            />
            <QuestionBlock question={question} media={media} onReveal={onReveal} />
            {face}
            <AnswerReveal answer={answer} />
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
