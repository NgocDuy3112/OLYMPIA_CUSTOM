
import {
    type ConsoleQuestion,
    type LiveResponse,
    type GiaiMaMc,
    type QuestionAnswerRow,
    type VeDichMc,
} from "@/lib/live"
import { pt } from "@shared/deck/geometry"
import { VerdictIcon } from "@shared/deck/stage"

// The MC console's surface: the shared flow primitives re-exported (one import
// site for screens — see @shared/deck/stage), plus the MC-only pieces: the
// verdict rail (CardData) and the orchestrator's ctx contract.

export {
    Badges,
    Band,
    CardHeader,
    MainCard,
    Progress,
    QuestionBlock,
    StageLayout,
    Status,
    Strip,
    Timer,
    VeDichStripCells,
    type StripItem,
} from "@shared/deck/stage"

// what one rail card shows
export interface CardData {
    id: string
    name: string
    points: number
    answer?: string        // answer-variant bottom line
    value?: string         // answer-variant value row
    verdict?: "CORRECT" | "INCORRECT" | null
    badge?: { text: string; tone: "primary" | "amber" | "emerald" }  // keyword / power pill
    ring?: "selected" | "active"
    dimmed?: boolean       // giai-ma eliminated
    /** has a live player socket right now (the hub's connected list) */
    connected?: boolean
}

const badgePill = (tone: "primary" | "amber" | "emerald") =>
    `flex items-center justify-center rounded-full px-[0.6cqw] font-sans font-semibold leading-tight ${tone === "primary"
        ? "bg-primary text-primary-foreground"
        : tone === "amber"
            ? "bg-amber-50 text-amber-700 ring-1 ring-amber-300"
            : "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-300"
    }`

/** The rail column: who's playing, what they answered, the MC's verdict on them. */
export function Rail({ variant, cards, onSelect }: { variant: "compact" | "answers"; cards: CardData[]; onSelect?: (id: string) => void }) {
    const isAnswers = variant === "answers"
    const Interactive = onSelect ? "button" : "div"
    return (
        <>
            {cards.map((c) => (
                <Interactive
                    key={c.id}
                    {...(onSelect ? { type: "button" as const, onClick: () => onSelect(c.id) } : {})}
                    className={`flex ${isAnswers ? "h-[11.9cqw]" : "h-[9.3cqw]"} w-full shrink-0 flex-col gap-[0.3cqw] overflow-hidden rounded-2xl bg-card p-[0.9cqw] text-left shadow-sm ring-1 ring-border transition ${onSelect ? "cursor-pointer hover:ring-sky-400" : ""
                        } ${c.ring === "selected" ? "ring-2 ring-primary" : c.ring === "active" ? "ring-2 ring-amber-400" : ""} ${c.dimmed ? "opacity-60" : ""
                        }`}
                >
                    <div className="flex min-h-0 flex-1 gap-[0.7cqw]">
                        <div className="relative w-[52%] shrink-0">
                            <div
                                className="flex h-full items-center justify-center rounded-lg bg-muted font-display font-bold text-muted-foreground"
                                style={{ fontSize: pt(16) }}
                                aria-hidden
                            >
                                {c.name.replace(/[^A-Za-zÀ-ỹ0-9]/g, "").slice(0, 2).toUpperCase() || "??"}
                            </div>
                            {/* connected dot — green = at a device, gray = gone/idle */}
                            <span
                                className={`absolute right-[0.3cqw] top-[0.4cqw] size-[1.2cqw] rounded-full ring-2 ring-card ${c.connected
                                        ? "bg-emerald-500 shadow-[0_0_0_2px_rgba(16,185,129,0.25)]"
                                        : "bg-muted-foreground/40"
                                    }`}
                            />
                        </div>
                        <div className="flex min-w-0 flex-1 flex-col justify-start gap-[0.3cqw] pt-[0.2cqw] text-center">
                            <span className="truncate font-display font-medium leading-none text-foreground" style={{ fontSize: pt(12) }}>
                                {c.name}
                            </span>
                            <span className="font-display font-bold leading-none tabular-nums text-foreground" style={{ fontSize: pt(isAnswers ? 44 : 34) }}>
                                {c.points}
                            </span>
                        </div>
                    </div>
                    {isAnswers && (
                        <div className="shrink-0 truncate px-[0.4cqw] text-center font-sans leading-snug text-muted-foreground" style={{ fontSize: pt(10) }} title={c.answer}>
                            {c.answer ?? "—"}
                        </div>
                    )}
                    {/* the bottom row: the badge, or the player state — value + verdict */}
                    {c.badge && !isAnswers ? (
                        <div className="flex shrink-0 justify-end" style={{ fontSize: pt(9) }}>
                            <span className={badgePill(c.badge.tone)}>{c.badge.text}</span>
                        </div>
                    ) : isAnswers ? (
                        <div className="flex shrink-0 items-center justify-center gap-[0.4cqw]">
                            {c.badge ? (
                                <span style={{ fontSize: pt(9) }} className={badgePill(c.badge.tone)}>
                                    {c.badge.text}
                                </span>
                            ) : (
                                <>
                                    <span className="truncate font-sans font-semibold tabular-nums text-foreground" style={{ fontSize: pt(12) }}>
                                        {c.value ?? "—"}
                                    </span>
                                    {c.verdict !== undefined && <VerdictIcon verdict={c.verdict} />}
                                </>
                            )}
                        </div>
                    ) : null}
                </Interactive>
            ))}
        </>
    )
}

// ── the screens' contract ────────────────────────────────────────────────────

/**
 * Everything a round screen may render with — built ONCE by the orchestrator
 * (live-console), which owns every hook, derived fact and action. Screens are
 * PURE: no hooks, no fetches, no mutations of their own.
 */
export interface DeckCtx {
    /** The polled live read: projection carries stage/open/oral/board/table. */
    v: LiveResponse
    /** The live stage (phase1/phase2/…) — round modules route on it. */
    stage: string
    roundEnded: boolean
    started: boolean
    remaining: number | null
    questions: ConsoleQuestion[]
    rows: QuestionAnswerRow[]
    baseCards: CardData[]
    /** giai-ma facts (null outside the round). */
    mcGiaiMa: GiaiMaMc | null
    /** ve-dich facts (null outside the round). */
    mcVeDich: VeDichMc | null
    /** but-pha's question cursor mirror (orchestrator state, reset per round). */
    bpDone: number
    /** the question the ledger is reading (khoi-dong S2 / but-pha S4). */
    judgingId: string | null
    /** verdict target = clicked card, else the first answering player. */
    target: string | null
    setSelectedQ: (questionId: string | null) => void
    setSelectedPlayer: (userId: string) => void
    /** stage an override verdict for the selected card (committed by Kết thúc). */
    setVerdict: (correct: boolean) => void
    /** version-guarded action senders. */
    send: (action: Record<string, unknown>) => void
    /** turn-based (ve-dich): finish the current TURN — the open question, verdicts first. */
    hetLuot: () => void
    /** end the whole ROUND (turn-based: the turn itself is hetLuot's job). */
    ketThuc: () => void
    byId: (id: string) => ConsoleQuestion | null
    verdictOf: (questionId: string, userId: string) => "CORRECT" | "INCORRECT" | null
    /** the MC's stopwatch (khoi-dong S1) — `watchMs` comes from the interval. */
    watchRunning: boolean
    watchMs: number
    toggleWatch: () => void
    /** refusal flash for the Status slots. */
    flash: string | null
    /** the round badge → the rounds navigator. */
    openRounds: () => void
}
