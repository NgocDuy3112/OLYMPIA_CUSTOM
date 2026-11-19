import { ConsoleStage, HintBars, KeywordLengthBanner, QuestionCard, Rail, Timer } from "@/components/stage/deck"
import { backToLobbyAction } from "@/components/stage/actions"
import { COPY } from "@shared/deck/copy"
import { HINT_TILES } from "@shared/deck/cells"

import type { ConsoleQuestion, GiaiMaConsole } from "@/lib/live"
import type { ScreenCore } from "../types"

export type GiaiMaCtx = ScreenCore & {
    remaining: number | null
    keywordRemaining: number | null
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
    const keywordLength: number | null = v.projection.keywordLength ?? null
    const hintQuestions = questions
        .filter((q) => q.roundId === "giai-ma" && q.kind !== "KEYWORD")
        .sort((a, b) => a.position - b.position)
    const openHintId = consoleGiaiMa?.openHintId ?? null
    const pickedHints = consoleGiaiMa?.hintsPicked ?? []
    let hintTarget = openHintId
    if (hintTarget === null) {
        if (pickedHints.length > 0) hintTarget = pickedHints[pickedHints.length - 1]
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
    const keywordOpen = (ctx.keywordRemaining ?? 0) > 0
    let startKeywordWindow: (() => void) | undefined = undefined
    if (keywordQ && !keywordOpen) startKeywordWindow = () => ctx.send({ kind: "giai-ma.startKeywordWindow" })
    let revealHint: (() => void) | undefined = undefined
    if (hintTarget) {
        const targetId = hintTarget
        revealHint = () => ctx.send({ kind: "reveal.answer", questionId: targetId })
    }
    let revealKeyword: (() => void) | undefined = undefined
    if (keywordQ) revealKeyword = () => ctx.send({ kind: "reveal.answer", questionId: keywordQ._id })
    let lockHints: (() => void) | undefined = undefined
    if (openHintId) lockHints = () => ctx.send({ kind: "giai-ma.lockHints" })
    let timerRemaining: number | null = null
    if ((ctx.keywordRemaining ?? 0) > 0) timerRemaining = ctx.keywordRemaining
    else if (open[0]?.deadlineAt) timerRemaining = remaining
    let questionText: string | null = null
    if (open.length > 0) questionText = open[0].question?.questionText ?? null

    return (
        <ConsoleStage
            rail={<Rail cards={baseCards} onSelect={ctx.toggleSelect} onScoreClick={ctx.openRegrade} />}
            actions={[
                { label: COPY.correct, onClick: commitHint },
                { label: COPY.judgeKeyword, onClick: commitKeyword },
                {
                    label: "Đếm giờ",
                    onClick: startWindow,
                },
                {
                    label: "Đếm giờ từ khoá",
                    onClick: startKeywordWindow,
                },
                {
                    label: "Khoá gợi ý",
                    onClick: lockHints,
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
            <KeywordLengthBanner
                length={keywordLength}
                kind={v.projection.keywordKind ?? undefined}
                code={v.projection.keywordCode ?? null}
                onClick={revealKeyword}
            />

            <HintBars
                tiles={tiles.map((q) => q?._id ?? null)}
                openTile={openHintId !== null ? hintQuestions.findIndex((q) => q._id === openHintId) : null}
                pickedTiles={hintQuestions
                    .map((q, index) => (pickedHints.includes(q._id) ? index : -1))
                    .filter((index) => index >= 0)}
                verdicts={{}}
                answers={v.projection.hintAnswers}
                onPick={openHint}
            />
            <QuestionCard
                round="Giải mã"
                size={28}
                right={<Timer remaining={timerRemaining} size={32} />}
                question={questionText}
                className="h-37.5"
            />
        </ConsoleStage>
    )
}
