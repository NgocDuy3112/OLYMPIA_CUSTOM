import type { ReactNode } from "react"
import { AnswerBand, AnswerBandIdle, HintBars, KeywordBox, KeywordLengthBanner, PlayerStage, QuestionCard, Rail, Timer, type PlayerCore } from "../player-deck"
import { pt } from "../geometry"
import type { AnswerValue } from "../types"

type GiaiMaPlayerCtx = PlayerCore & {
    remaining: number
    answerBusy: boolean
    submitAnswer: (questionId: string, value: AnswerValue) => void
    keywordBusy: boolean
    submitKeyword: (questionId: string, text: string) => void
}

export function GiaiMaAOCPlayer({ ctx }: { ctx: GiaiMaPlayerCtx }) {
    const { v, remaining, myId, flash, answerBusy, submitAnswer, keywordBusy, submitKeyword } = ctx
    const hintWindow = ctx.open[0] ?? null
    const keyword = v.keyword
    const locked = v.me.keywordLocked === true
    const codeLength = keyword?.question?.payload.codeLength ?? null

    let keywordSlot: ReactNode = null
    if (keyword) {
        keywordSlot = (
            <KeywordBox
                busy={keywordBusy}
                onSubmit={(text) => submitKeyword(keyword.questionId, text)}
            />
        )
    }
    if (locked) {
        keywordSlot = (
            <span className="inline-flex items-center gap-[0.5cqw] font-sans font-semibold text-emerald-600" style={{ fontSize: pt(12) }}>
            </span>
        )
    }

    let timerRemaining: number | null = null
    if (hintWindow) {
        if (hintWindow.deadlineAt) timerRemaining = remaining
    }
    let questionText: string | null = null
    if (hintWindow) questionText = hintWindow.question?.questionText ?? null
    let answerSlot: ReactNode = <AnswerBandIdle />
    if (hintWindow && hintWindow.deadlineAt) {
        answerSlot = (
            <AnswerBand
                question={hintWindow.question}
                answerState={v.me.answerState}
                disabled={remaining <= 0}
                busy={answerBusy}
                error={flash}
                onSubmit={(value) => submitAnswer(hintWindow.questionId, value)}
            />
        )
    }

    return (
        <PlayerStage
            rail={<Rail view={v} myId={myId} currentQid={hintWindow?.questionId ?? keyword?.questionId ?? null} />}
        >
            <KeywordLengthBanner length={codeLength} code={v.keywordCode ?? null} />

            <HintBars
                openTile={v.me.openTile ?? null}
                pickedTiles={v.me.pickedTiles ?? []}
                verdicts={v.me.hintVerdicts ?? {}}
                answers={v.hintAnswers ?? {}}
                code={v.keywordCode ?? null}
            />

            <QuestionCard
                round="Giải mã"
                size={28}
                right={<Timer remaining={timerRemaining} size={32} />}
                question={questionText}
                className="h-50"
            />
            <div className="flex w-full flex-col gap-[0.7cqw]">
                {answerSlot}
                {keywordSlot}
            </div>
        </PlayerStage>
    )
}
