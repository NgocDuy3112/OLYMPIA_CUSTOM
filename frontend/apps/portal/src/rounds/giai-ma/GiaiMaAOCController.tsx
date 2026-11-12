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
    const { v, remaining, questions, baseCards, consoleGiaiMa, flash, openRounds } = ctx
    const open = v.projection.open

    const keywordQ = questions.find((q) => q.roundId === "giai-ma" && q.kind === "KEYWORD")
    const keywordLength = typeof keywordQ?.payload.code === "string" ? keywordQ.payload.code.length : null
    const hintQuestions = questions
        .filter((q) => q.roundId === "giai-ma" && q.kind !== "KEYWORD")
        .sort((a, b) => a.position - b.position)
    const openHintId = consoleGiaiMa?.openHintId ?? null
    const pickedHints = consoleGiaiMa?.hintsPicked ?? []
    const hintTarget = openHintId
        ?? (pickedHints.length > 0 ? pickedHints[pickedHints.length - 1] : null)
    const tileState = (qid: string): HintTile =>
        qid === openHintId ? "open" : consoleGiaiMa?.hintsPicked.includes(qid) ? "used" : "free"
    const openHint = (qid: string) => ctx.send({ kind: "giai-ma.openHint", hintId: qid })
    const tiles = Array.from({ length: HINT_TILES }, (_, i) => hintQuestions[i] ?? null)

    return (
        <ConsoleStage
            rail={<Rail variant="answers" cards={baseCards} onSelect={ctx.toggleSelect} />}
            actions={[
                { label: COPY.correct, onClick: ctx.commitHintReady ? () => ctx.commitHint() : undefined },
                { label: COPY.wrong },
                { label: COPY.judgeKeyword, onClick: ctx.commitKeywordReady ? () => ctx.commitKeyword() : undefined },
                {
                    label: "Hiện đáp án gợi ý",
                    onClick: hintTarget
                        ? () => ctx.send({ kind: "reveal.answer", questionId: hintTarget })
                        : undefined,
                },
                {
                    label: "Hiện đáp án từ khoá",
                    onClick: keywordQ
                        ? () => ctx.send({ kind: "reveal.answer", questionId: keywordQ._id })
                        : undefined,
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
                    const state: HintTile = q ? tileState(q._id) : "absent"
                    const interactive = state === "free"
                    return (
                        <div
                            key={q?._id ?? `absent-${i}`}
                            onClick={interactive && q ? () => openHint(q._id) : undefined}
                            role={interactive ? "button" : undefined}
                            tabIndex={interactive ? 0 : undefined}
                            onKeyDown={interactive && q ? (event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                    event.preventDefault()
                                    openHint(q._id)
                                }
                            } : undefined}
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
                onRoundClick={openRounds}
                right={<Timer remaining={open[0]?.deadlineAt ? remaining : null} size={32} />}
                question={open.length > 0 ? open[0].question?.questionText ?? "" : "Chọn một hint để mở cửa sổ trả lời"}
                className="flex-none"
            />
        </ConsoleStage>
    )
}
