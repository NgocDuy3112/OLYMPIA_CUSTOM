// The console rail's CARDS — the pure projection every round screen draws from.
//
// This used to be a ~55-line loop inside `useConsoleModel`: no hook, no
// transport, just "score row + live view → what the card shows". Lifted out so
// it can be table-tested without React and so the model file only composes.
//
// The rules it encodes, in one place:
//   · giai-ma rings the MULTI-SELECT (the clicked cards are the correct ones);
//     every other round rings the verdict TARGET (clicked card, else the first
//     answerer). One ring field, two meanings, decided by the round.
//   · the answers rail adds the bottom lines (answer text + value, and the
//     verdict — which the caller resolves, because staged overrides outrank the
//     submitted one).
// Presence is NOT drawn here: a camera (or its absence) on the card says whether
// somebody is there, and a second green dot for the same fact was one signal too
// many.
//
//   · the purple card marks the LIVE ANSWERER: ve-dich's buzz winner or the one
//     who won a Khởi động race.
//   · an open oral run rings that player for the whole run (phase 1 only).
import type { RemoteVideoTrack } from "livekit-client"
import type { CardData } from "@/components/stage/rail"
import { valueText } from "@/components/stage/ledger"
import type {
    ConsoleQuestion,
    GiaiMaConsole,
    KhoiDongConsole,
    Projection,
    QuestionAnswerRow,
    VeDichConsole,
} from "@/lib/live"

/** Everything the cards read — gathered by the model, never fetched here. */
export interface RailCardsInput {
    /** the projection's score table (id / name / points) */
    table: Projection["table"]
    /** the answer rows for the question the rail is reading */
    rows: QuestionAnswerRow[]
    roundId: string
    railVariant: "compact" | "answers"
    /** the question the answers rail describes (judging or resolving id) */
    railQ: string | null
    railQuestion: ConsoleQuestion | null
    judgingId: string | null
    resolvingId: string | null
    /** the verdict target: clicked card, else the first answerer */
    target: string | null
    /** giai-ma's multi-select for the CURRENT question */
    selectedIds: ReadonlySet<string>
    /** the player's live camera, by user id (Room identity === card id) */
    videoOf: (id: string) => RemoteVideoTrack | null
    /** the card's verdict — staged override first, else the submitted row */
    verdictOf: (questionId: string, userId: string) => "CORRECT" | "INCORRECT" | null
    giaiMa: GiaiMaConsole | null
    veDich: VeDichConsole | null
    khoiDong: KhoiDongConsole | null
    /** an open oral run's player (phase 1) */
    oralPlayerId: string | null
}

/** Which player wears the purple card this frame — the live answerer. */
function buzzingIdOf(input: RailCardsInput): string | null {
    if (input.roundId === "ve-dich") return input.veDich?.buzzerId ?? null
    if (input.roundId === "khoi-dong") return input.khoiDong?.buzzerId ?? null
    return null
}

/** Is this card ringed? giai-ma rings the multi-select, other rounds the target. */
function ringOf(id: string, input: RailCardsInput): CardData["ring"] {
    if (input.roundId === "giai-ma") {
        return input.judgingId !== null && input.selectedIds.has(id) ? "selected" : undefined
    }
    const targetIsLive = (input.judgingId ?? input.resolvingId) !== null
    return input.target === id && targetIsLive ? "selected" : undefined
}

/** The answers rail's bottom lines: what they answered, what it is worth, the verdict. */
function applyAnswer(card: CardData, row: QuestionAnswerRow | undefined, input: RailCardsInput): void {
    if (input.railVariant !== "answers" || !input.railQ) return
    card.answer = row ? valueText(row, input.railQuestion) : "—"
    card.value = row
        ? row.pointsAwarded !== null
            ? String(row.pointsAwarded)
            : row.verdict === null
              ? "…"
              : valueText(row, input.railQuestion)
        : "—"
    card.verdict = input.verdictOf(input.railQ, card.id)
}

/** The giai-ma badge / dimming — the keyword lock and the elimination. */
function applyGiaiMa(card: CardData, input: RailCardsInput): void {
    if (input.roundId !== "giai-ma" || !input.giaiMa) return
    const player = input.giaiMa.players.find((p) => p.id === card.id)
    if (player?.keywordLocked) card.badge = { text: "Giải mật mã", tone: "primary" }
    if (player?.eliminated) card.dimmed = true
}

/** The ve-dich power badge — STAR sits on the answerer, ASSIGN on the handed-to player. */
function applyPower(card: CardData, input: RailCardsInput): void {
    const power = input.roundId === "ve-dich" ? input.veDich?.power : null
    if (!power || !input.veDich) return
    if (power === "STAR" && input.veDich.answererId === card.id) {
        card.badge = { text: "Ngôi sao", tone: "amber" }
    }
    if (power === "ASSIGN" && input.veDich.assignedToId === card.id) {
        card.badge = { text: "Được chỉ định", tone: "emerald" }
    }
}

/**
 * Build the rail's cards: one per score row, in table order.
 *
 * Pure — same input, same cards.
 */
export function railCardsOf(input: RailCardsInput): CardData[] {
    const buzzingId = buzzingIdOf(input)

    const cards = input.table.map((seat): CardData => {
        const card: CardData = {
            id: seat.id,
            name: seat.displayName,
            points: seat.points,
            ring: ringOf(seat.id, input),
            // identity === user id → the player's camera joins by plain equality
            video: input.videoOf(seat.id),
        }
        applyAnswer(card, input.rows.find((r) => r.userId === seat.id), input)
        applyGiaiMa(card, input)
        if (buzzingId !== null && buzzingId === seat.id) card.buzzing = true
        applyPower(card, input)
        return card
    })

    // the oral round: ring the player whose run is open (oral exists only in phase 1)
    if (input.oralPlayerId !== null) {
        for (const card of cards) card.ring = card.id === input.oralPlayerId ? "active" : undefined
    }

    return cards
}
