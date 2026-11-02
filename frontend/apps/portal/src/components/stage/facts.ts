// What the MC console KNOWS: the orchestrator gathers it ONCE (use-console-model)
// and screens never see it whole. Each round module projects the narrow slice
// its screens need (`rounds/<round>/logic` → `ScreenCore & { …extras }`), so a
// screen's ctx type says exactly what it depends on.
import type { ConsoleQuestion, LiveResponse, QuestionAnswerRow } from "@/lib/live"
import type { CardData } from "./rail"

export interface ConsoleFacts {
    /** The socket's snapshot (poll fallback): projection carries stage/open/oral/board/table. */
    v: LiveResponse
    /** The live stage (phase1/phase2/…) — round modules route on it. */
    stage: string
    remaining: number | null
    rows: QuestionAnswerRow[]
    baseCards: CardData[]
    /** the question the ledger is reading (khoi-dong S2 / but-pha S4 / giai-ma). */
    judgingId: string | null
    /** verdict target = clicked card, else the first answering player. */
    target: string | null
    setSelectedQ: (questionId: string | null) => void
    setSelectedPlayer: (userId: string) => void
    /** giai-ma: toggle a card in the multi-select — the clicked players are the
     * ones Đúng / Đúng từ khoá will judge CORRECT. */
    toggleSelect: (userId: string) => void
    /** giai-ma: the commits are ready (players selected ON the current question).
     *  The screen disables the buttons until then. */
    commitHintReady: boolean
    commitKeywordReady: boolean
    /** giai-ma: commit the hint window (resolve with verdicts) / the keyword
     *  drafts (selected = correct, the rest of the submitters = wrong). */
    commitHint: () => void
    commitKeyword: () => void
    /** stage an override verdict for the selected card (committed by Kết thúc). */
    setVerdict: (correct: boolean) => void
    /** version-guarded action senders. */
    send: (action: Record<string, unknown>) => void
    /** turn-based (ve-dich): finish the current TURN — the open question, verdicts first. */
    hetLuot: () => void
    /** end the whole ROUND (turn-based: the turn itself is hetLuot's job). */
    backToLobby: () => void
    /** Tính giờ — pick the round's NEXT question (but-pha's question cursor). */
    pickQuestion: () => void
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
    /** open the score-adjust dialog for one seated player. */
    openAdjust: (userId: string) => void
}
