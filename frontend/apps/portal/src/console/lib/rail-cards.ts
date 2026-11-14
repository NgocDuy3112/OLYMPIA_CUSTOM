import type { RemoteVideoTrack } from "livekit-client"
import type { CardData } from "@/components/stage/rail"
import { formatBuzzMs } from "@shared/lib/clock"
import { valueText } from "@/components/stage/ledger"
import type {
    ConsoleQuestion,
    GiaiMaConsole,
    KhoiDongConsole,
    Projection,
    QuestionAnswerRow,
    VeDichConsole,
} from "@/lib/live"

export interface RailCardsInput {
    table: Projection["table"]
    rows: QuestionAnswerRow[]
    roundId: string
    railVariant: "compact" | "answers"
    railQ: string | null
    railQuestion: ConsoleQuestion | null
    judgingId: string | null
    resolvingId: string | null
    target: string | null
    selectedIds: ReadonlySet<string>
    videoOf: (id: string) => RemoteVideoTrack | null
    verdictOf: (questionId: string, userId: string) => "CORRECT" | "INCORRECT" | null
    giaiMa: GiaiMaConsole | null
    veDich: VeDichConsole | null
    khoiDong: KhoiDongConsole | null
    oralPlayerId: string | null
}

/** the winner of the race says so on their card, with the time — the same
 *  line the player rail draws for itself */
function applyBuzz(card: CardData, input: RailCardsInput): void {
    if (input.roundId !== "ve-dich" || input.veDich?.buzzerId !== card.id) return
    card.buzzing = true
    card.answer = "Đã bấm chuông"
    const ms = input.veDich.buzzerMs
    if (ms !== null && ms !== undefined) card.value = formatBuzzMs(ms)
}

function ringOf(id: string, input: RailCardsInput): CardData["ring"] {
    const ticked = input.judgingId !== null && input.selectedIds.has(id)
    // an active selection is what the console is grading, so it outranks the
    // fallback target — otherwise the first answerer looks chosen by accident
    if (input.selectedIds.size > 0) return ticked ? "selected" : undefined
    if (input.roundId === "giai-ma") return undefined
    const targetIsLive = (input.judgingId ?? input.resolvingId) !== null
    if (input.target === id && targetIsLive) return "selected"
    // phase 2: the card of who plays next is marked until one is chosen
    if (input.veDich?.phase === 2 && input.veDich.turnPlayerId === id) return "active"
    return undefined
}

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

function applyGiaiMa(card: CardData, input: RailCardsInput): void {
    if (input.roundId !== "giai-ma" || !input.giaiMa) return
    const player = input.giaiMa.players.find((p) => p.id === card.id)
    if (player?.keywordLocked) card.badge = { text: "Giải mật mã", tone: "primary" }
    if (player?.eliminated) card.dimmed = true
}

/** the staged power shows on the player it will act for, before the question opens */
function applyStagedPower(card: CardData, input: RailCardsInput): void {
    const staged = input.veDich?.stagedPower
    if (!staged || input.veDich?.turnPlayerId !== card.id) return
    card.badge = staged.power === "STAR"
        ? { text: "Ngôi sao", tone: "amber" }
        : { text: "Chỉ định", tone: "emerald" }
}

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

export function railCardsOf(input: RailCardsInput): CardData[] {
    const cards = input.table.map((seat): CardData => {
        const card: CardData = {
            id: seat.id,
            name: seat.displayName,
            points: seat.points,
            ring: ringOf(seat.id, input),
            video: input.videoOf(seat.id),
        }
        applyAnswer(card, input.rows.find((r) => r.userId === seat.id), input)
        applyGiaiMa(card, input)
        applyStagedPower(card, input)
        applyPower(card, input)
        applyBuzz(card, input)
        return card
    })

    if (input.oralPlayerId !== null) {
        for (const card of cards) card.ring = card.id === input.oralPlayerId ? "active" : undefined
    }

    return cards
}
