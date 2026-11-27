import { expect, vi } from "vitest"
import { render } from "@testing-library/react"

import type { ConsoleFacts } from "@/components/stage/deck"
import type { LiveResponse, VeDichCapabilities, VeDichConsole } from "@/lib/live"
import { roundModuleOf } from "@/rounds"

export type ProjectionOverride = Omit<Partial<LiveResponse["projection"]>, "capabilities"> & {
    capabilities?: Partial<VeDichCapabilities>
}

function capabilitiesOf(
    mc: VeDichConsole | null,
    projection: ProjectionOverride,
    remaining: number | null,
): VeDichCapabilities {
    const open = projection.open?.[0] ?? null
    const hasOpen = open !== null
    const phase2 = mc?.phase === 2
    const revealed = mc?.revealed ?? false
    const started = mc?.clockStarted === true
    const oral = mc?.openStage === "current"
    const buzz = mc?.openStage === "buzz"
    const buzzer = mc?.buzzerId ?? null
    const counting = Boolean(open?.deadlineAt) && (remaining ?? 0) > 0
    const pending = mc?.pendingQuestionId ?? null
    const powersLeft = mc?.powersLeft
    const hasPower = powersLeft === undefined || powersLeft.length > 0
    const duel = mc?.assignedToId != null
    return {
        canOpenQuestion: !hasOpen,
        canSwitchQuestion: hasOpen && !revealed && !started && buzzer === null,
        canReveal: hasOpen && !revealed,
        canStartClock: hasOpen && revealed && !started,
        canCloseCurrentAnswer: phase2 && hasOpen && oral && started && !counting,
        canLockBuzz: hasOpen && buzz && buzzer === null && started,
        canCloseQuestion: mc?.phase === 1 && hasOpen && revealed && started,
        canResolve: hasOpen && !(phase2 && oral) && (!duel || buzzer !== null || (started && !counting)),
        canStorePower: phase2 && !hasOpen && pending !== null && hasPower
            && mc?.turnPowerUsed !== true && (mc?.stagedPower ?? null) === null,
        canUnstagePower: phase2 && !hasOpen && pending !== null && (mc?.stagedPower ?? null) !== null,
    }
}

export function facts(
    over: Partial<ConsoleFacts> = {},
    projection: ProjectionOverride = {},
    mc: unknown = null,
    questions: LiveResponse["questions"] = [],
    roundId = "khoi-dong",
): ConsoleFacts {
    const v: LiveResponse = {
        version: 1,
        roundId,
        state: {},
        questions,
        projection: {
            matchId: "m1",
            roundId,
            version: 1,
            stage: "phase1",
            open: [],
            table: [{ id: "u1", displayName: "An", points: 10, rank: 1 }],
            hintAnswers: {},
            ...projection,
            capabilities: {
                ...capabilitiesOf(mc as VeDichConsole | null, projection, over.remaining ?? 30),
                ...projection.capabilities,
            },
        },
        roundEnded: false,
        connected: [],
        console: (mc === null ? null : { roundId, console: mc }) as unknown as LiveResponse["console"],
        controller: null,
    }
    return {
        v,
        stage: "phase1",
        remaining: 30,
        rows: [],
        baseCards: [],
        peerControls: new Map(),
        judgingId: null,
        target: null,
        setSelectedQ: vi.fn(),
        setSelectedPlayer: vi.fn(),
        toggleSelect: vi.fn(),
        selectedIds: new Set<string>(),
        commitHintReady: false,
        commitKeywordReady: false,
        commitHint: vi.fn(),
        commitKeyword: vi.fn(),
        setVerdict: vi.fn(),
        send: vi.fn(),
        sendChain: vi.fn(),
        hetLuot: vi.fn(),
        backToLobby: vi.fn(),
        pickQuestion: vi.fn(),
        byId: () => null,
        verdictOf: () => null,
        oralRemaining: null,
        keywordRemaining: null,
        flash: null,
        openAdjust: vi.fn(),
        openRegrade: vi.fn(),
        ...over,
    }
}

export function renderRound(
    roundId: string,
    over: Partial<ConsoleFacts> = {},
    projection: ProjectionOverride = {},
    mc: unknown = null,
    questions: LiveResponse["questions"] = [],
): ConsoleFacts {
    const f = facts(over, projection, mc, questions, roundId)
    const mod = roundModuleOf(roundId)
    if (!mod) throw new Error(`no round module for "${roundId}"`)
    render(mod.render(f))
    return f
}

export const openQ = { questionId: "q1", deadlineAt: null, question: null }

export const veDichMc = (over: Partial<VeDichConsole> = {}): VeDichConsole => ({
    phase: 1,
    turnPlayerId: "u1",
    openStage: "current",
    answererId: "u1",
    buzzerId: null,
    buzzerMs: null,
    assignedToId: null,
    power: null,
    pendingQuestionId: null,
    stagedPower: null,
    turnPowerUsed: false,
    turnPicked: 0,
    powersLeft: ["STAR", "ASSIGN"],
    ...over,
})

export const butPhaQuestions: LiveResponse["questions"] = [0, 1, 2, 3].map((i) => ({
    _id: `bp-${i + 1}`,
    kind: "TEXT",
    roundId: "but-pha",
    turnId: "phase1",
    position: i,
    questionText: `Câu hỏi BP ${i + 1}`,
    points: 10,
    payload: { acceptedAnswers: [] },
}))

export const byButPhaId = (id: string) => butPhaQuestions.find((q) => q._id === id) ?? null

export const TWO_PLAYERS = [
    { id: "u1", displayName: "An", points: 10, rank: 1 },
    { id: "u2", displayName: "Bình", points: 0, rank: 2 },
]

export const THREE_PLAYERS = [
    ...TWO_PLAYERS,
    { id: "u3", displayName: "Cúc", points: 5, rank: 3 },
]

export const answerRow = (userId: string, verdict: "CORRECT" | "INCORRECT" | null) => ({
    questionId: "q1",
    userId,
    value: { text: "đáp án" },
    verdict,
    pointsAwarded: verdict === "CORRECT" ? 20 : 0,
})

function clickables(): string[] {
    return Array.from(document.querySelectorAll('button, [role="button"]')).map((el) => el.textContent ?? "")
}

export function expectButtonsInOrder(expected: string[]) {
    const actual = clickables()
    let cursor = -1
    for (const label of expected) {
        const at = actual.indexOf(label, cursor + 1)
        expect(at, `"${label}" missing after index ${cursor} — got [${actual.join(" · ")}]`).toBeGreaterThan(cursor)
        cursor = at
    }
}
