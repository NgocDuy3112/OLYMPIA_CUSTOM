import type { KeyboardEventHandler } from "react"
import { ConsoleStage, KeywordLengthBanner, QuestionCard, Rail, Timer } from "@/components/stage/deck"
import { backToLobbyAction } from "@/components/stage/actions"
import { pt } from "@shared/deck/geometry"
import { HINT_TILES, hintTileClass, type HintTile } from "@shared/deck/cells"
import { COPY } from "@shared/deck/copy"

import type { ConsoleQuestion, GiaiMaConsole } from "@/lib/live"
import type { ScreenCore } from "../types"

export type GiaiMaCtx = ScreenCore & {
    remaining: number | null
    questions: ConsoleQuestion[]
    consoleGiaiMa: GiaiMaConsole | null
    toggleSelect: (userId: string) => void
    commitHintReady: boolean
    commitKeywordReady: boolean
    commitHint: () => void
    commitKeyword: () => void
}

export function GiaiMaAOCController({ ctx }: { ctx: GiaiMaCtx }) {
    const { v, remaining, questions, baseCards, consoleGiaiMa, flash } = ctx
    const open = v.projection.open

    const keywordQ = questions.find((q) => q.roundId === "giai-ma" && q.kind === "KEYWORD")
    let keywordLength: number | null = null
    if (typeof keywordQ?.payload.code === "string") keywordLength = keywordQ.payload.code.length
    const hintQuestions = questions
        .filter((q) => q.roundId === "giai-ma" && q.kind !== "KEYWORD")
        .sort((a, b) => a.position - b.position)
    const openHintId = consoleGiaiMa?.openHintId ?? null
    const pickedHints = consoleGiaiMa?.hintsPicked ?? []
    let hintTarget = openHintId
    if (hintTarget === null) {
        if (pickedHints.length > 0) hintTarget = pickedHints[pickedHints.length - 1]
    }
    const tileState = (qid: string): HintTile => {
        if (qid === openHintId) return "open"
        if (consoleGiaiMa?.hintsPicked.includes(qid)) return "used"
        return "free"
    }
    const openHint = (qid: string) => ctx.send({ kind: "giai-ma.openHint", hintId: qid })
    const tiles = Array.from({ length: HINT_TILES }, (_, i) => hintQuestions[i] ?? null)

    let commitHint: (() => void) | undefined = undefined
    if (ctx.commitHintReady) commitHint = () => ctx.commitHint()
    let commitKeyword: (() => void) | undefined = undefined
    if (ctx.commitKeywordReady) commitKeyword = () => ctx.commitKeyword()
    let startWindow: (() => void) | undefined = undefined
    if (openHintId) {
        if (!consoleGiaiMa?.windowOpen) startWindow = () => ctx.send({ kind: "giai-ma.startWindow" })
    }
    let revealHint: (() => void) | undefined = undefined
    if (hintTarget) {
        const targetId = hintTarget
        revealHint = () => ctx.send({ kind: "reveal.answer", questionId: targetId })
    }
    let revealKeyword: (() => void) | undefined = undefined
    if (keywordQ) revealKeyword = () => ctx.send({ kind: "reveal.answer", questionId: keywordQ._id })
    let timerRemaining: number | null = null
    if (open[0]?.deadlineAt) timerRemaining = remaining
    let questionText: string | null = null
    if (open.length > 0) questionText = open[0].question?.questionText ?? null

    return (
        <ConsoleStage
            rail={<Rail variant="answers" cards={baseCards} onSelect={ctx.toggleSelect} />}
            actions={[
                { label: COPY.correct, onClick: commitHint },
                { label: COPY.wrong },
                { label: COPY.judgeKeyword, onClick: commitKeyword },
                {
                    label: "Đếm giờ",
                    onClick: startWindow,
                },
                {
                    label: "Hiện đáp án gợi ý",
                    onClick: revealHint,
                },
                {
                    label: "Hiện đáp án từ khoá",
                    onClick: revealKeyword,
                },
                backToLobbyAction(ctx.backToLobby),
            ]}
            flash={flash}
        >
            <KeywordLengthBanner length={keywordLength} />

            
            <div
                className="grid min-h-0 flex-1 gap-x-[2.2cqw] gap-y-[1.1cqw]"
                style={{
                    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                    gridTemplateRows: `repeat(${Math.ceil(HINT_TILES / 4)}, minmax(0, 1fr))`,
                }}
            >
                {tiles.map((q, i) => {
                    let state: HintTile = "absent"
                    if (q) state = tileState(q._id)
                    const interactive = state === "free"
                    let tileClick: (() => void) | undefined = undefined
                    if (interactive) {
                        if (q) tileClick = () => openHint(q._id)
                    }
                    let tileRole: "button" | undefined = undefined
                    let tileTabIndex: number | undefined = undefined
                    if (interactive) {
                        tileRole = "button"
                        tileTabIndex = 0
                    }
                    let tileKeyDown: KeyboardEventHandler<HTMLDivElement> | undefined = undefined
                    if (interactive) {
                        if (q) {
                            tileKeyDown = (event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                    event.preventDefault()
                                    openHint(q._id)
                                }
                            }
                        }
                    }
                    return (
                        <div
                            key={q?._id ?? `absent-${i}`}
                            onClick={tileClick}
                            role={tileRole}
                            tabIndex={tileTabIndex}
                            onKeyDown={tileKeyDown}
                            className={hintTileClass(state, interactive)}
                            style={{ fontSize: pt(60) }}
                        >
                            {i + 1}
                        </div>
                    )
                })}
            </div>

            <QuestionCard
                round="Giải mã"
                size={28}
                right={<Timer remaining={timerRemaining} size={32} />}
                question={questionText}
                className="flex-none"
            />
        </ConsoleStage>
    )
}
