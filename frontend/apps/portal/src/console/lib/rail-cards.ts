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
    keywordQuestionId?: string | null
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
    if (player?.eliminated) card.dimmed = true
}

function applyTurnIcon(card: CardData, input: RailCardsInput): void {
    if (input.roundId !== "ve-dich") return
    const veDich = input.veDich
    if (!veDich) return
    const staged = veDich.stagedPower
    if (staged) {
        if (staged.power === "STAR") {
            if (veDich.turnPlayerId === card.id) card.icon = "star"
        }
        if (staged.power === "ASSIGN") {
            if (veDich.turnPlayerId === card.id) card.icon = "swords"
        }
        return
    }
    if (veDich.power === "STAR") {
        if (veDich.answererId === card.id) card.icon = "star"
    }
    if (veDich.power === "ASSIGN") {
        if (veDich.answererId === card.id) card.icon = "swords"
        if (veDich.assignedToId === card.id) card.icon = "swords"
    }
}

function applyKeyword(card: CardData, row: QuestionAnswerRow | undefined): void {
    if (!row || row.value === null) return
    const text = row.value.text
    if (typeof text !== "string" || text === "") return
    card.answer = text
    card.answeredMs = row.answeredMs ?? null
    card.badge = { text: "TỪ KHOÁ", tone: "primary" }
}

export function railCardsOf(input: RailCardsInput): CardData[] {
    const rowsFor = (userId: string): QuestionAnswerRow | undefined => {
        const pool = input.railQ
            ? input.rows.filter((row) => row.questionId === input.railQ)
            : input.rows
        const mine = pool.filter((row) => row.userId === userId)
        return mine.length > 0 ? mine[mine.length - 1] : undefined
    }
    const keywordRowFor = (userId: string): QuestionAnswerRow | undefined => {
        if (!input.keywordQuestionId) return undefined
        const mine = input.rows.filter(
            (row) => row.questionId === input.keywordQuestionId && row.userId === userId,
        )
        return mine.length > 0 ? mine[mine.length - 1] : undefined
    }

    const cards = input.table.map((seat): CardData => {
        const card: CardData = {
            id: seat.id,
            name: seat.displayName,
            points: seat.points,
            ring: ringOf(seat.id, input),
            video: input.videoOf(seat.id),
        }
        applyAnswer(card, rowsFor(seat.id), input)
        applyGiaiMa(card, input)
        applyTurnIcon(card, input)
        applyBuzz(card, input)
        if (input.roundId === "giai-ma") {
            const kRow = keywordRowFor(seat.id)
            applyKeyword(card, kRow)
            const player = input.giaiMa?.players.find((p) => p.id === seat.id)
            if (player?.keywordLocked) {
                const text = typeof kRow?.value?.text === "string" && kRow.value.text !== ""
                    ? kRow.value.text
                    : "TỪ KHOÁ"
                card.badge = { text, tone: "primary" }
            }
        }
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
