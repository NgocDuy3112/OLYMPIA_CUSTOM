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

function buzzingIdOf(input: RailCardsInput): string | null {
    if (input.roundId === "ve-dich") return input.veDich?.buzzerId ?? null
    return null
}

function ringOf(id: string, input: RailCardsInput): CardData["ring"] {
    if (input.roundId === "giai-ma") {
        return input.judgingId !== null && input.selectedIds.has(id) ? "selected" : undefined
    }
    const targetIsLive = (input.judgingId ?? input.resolvingId) !== null
    return input.target === id && targetIsLive ? "selected" : undefined
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
    const buzzingId = buzzingIdOf(input)

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
        if (buzzingId !== null && buzzingId === seat.id) card.buzzing = true
        applyPower(card, input)
        return card
    })

    if (input.oralPlayerId !== null) {
        for (const card of cards) card.ring = card.id === input.oralPlayerId ? "active" : undefined
    }

    return cards
}
