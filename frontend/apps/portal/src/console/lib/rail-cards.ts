import type { RemoteVideoTrack } from "livekit-client"
import type { CardData } from "@/components/stage/rail"
import { formatDurationMs } from "@shared/lib/clock"
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
    giaiMa: GiaiMaConsole | null
    veDich: VeDichConsole | null
    khoiDong: KhoiDongConsole | null
    oralPlayerId: string | null
}

function applyBuzz(card: CardData, input: RailCardsInput): void {
    if (input.roundId !== "ve-dich" || input.veDich?.buzzerId !== card.id) return
    card.buzzing = true
    card.answer = "Đã bấm chuông"
    const ms = input.veDich.buzzerMs
    if (ms !== null && ms !== undefined) card.value = formatDurationMs(ms)
}

function ringOf(id: string, input: RailCardsInput): CardData["ring"] {
    const ticked = input.judgingId !== null && input.selectedIds.has(id)
    if (input.selectedIds.size > 0) {
        if (ticked) return "selected"
        return undefined
    }
    if (input.roundId === "giai-ma") return undefined
    const targetIsLive = (input.judgingId ?? input.resolvingId) !== null
    if (input.target === id && targetIsLive) return "selected"
    if (input.veDich?.phase === 2 && input.veDich.turnPlayerId === id) return "active"
    return undefined
}

function applyAnswer(card: CardData, row: QuestionAnswerRow | undefined, input: RailCardsInput): void {
    if (input.railVariant !== "answers" || !input.railQ) return
    let answer = "—"
    if (row) answer = valueText(row, input.railQuestion)
    card.answer = answer
    card.answeredMs = row?.answeredMs ?? null
}

function applyGiaiMa(card: CardData, input: RailCardsInput): void {
    if (input.roundId !== "giai-ma" || !input.giaiMa) return
    const player = input.giaiMa.players.find((p) => p.id === card.id)
    if (player?.keywordLocked) card.badge = { text: "Giải mật mã", tone: "primary" }
    if (player?.eliminated) card.dimmed = true
}

function applyStagedPower(card: CardData, input: RailCardsInput): void {
    const staged = input.veDich?.stagedPower
    if (!staged || input.veDich?.turnPlayerId !== card.id) return
    let badgeText = "Chỉ định"
    let badgeTone: "emerald" | "amber" = "emerald"
    if (staged.power === "STAR") {
        badgeText = "Ngôi sao"
        badgeTone = "amber"
    }
    card.badge = { text: badgeText, tone: badgeTone }
}

function applyPower(card: CardData, input: RailCardsInput): void {
    const veDichPower = input.veDich?.power
    let power: typeof veDichPower = null
    if (input.roundId === "ve-dich") power = veDichPower
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
        for (const card of cards) {
            if (card.id === input.oralPlayerId) {
                card.ring = "active"
            } else {
                card.ring = undefined
            }
        }
    }

    return cards
}
