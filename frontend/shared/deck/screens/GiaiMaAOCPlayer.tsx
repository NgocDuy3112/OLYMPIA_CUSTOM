import type { ReactNode } from "react"
import { useCountdown, type ServerClock } from "@shared/lib/clock"
import { AnswerBand, AnswerBandIdle, HintBars, KeywordBox, KeywordLengthBanner, PlayerStage, QuestionCard, Rail, SubmissionLog, Timer, type PlayerCore, type SubmissionEntry } from "../player-deck"
import { STRIP_R, pt } from "../geometry"
import type { AnswerValue } from "../types"

type GiaiMaPlayerCtx = PlayerCore & {
    remaining: number
    clock: ServerClock
    answerBusy: boolean
    submitAnswer: (questionId: string, value: AnswerValue) => void
    keywordBusy: boolean
    submitKeyword: (questionId: string, text: string) => void
}

export function GiaiMaAOCPlayer({ ctx }: { ctx: GiaiMaPlayerCtx }) {
    const { v, remaining, myId, flash, answerBusy, submitAnswer, keywordBusy, submitKeyword } = ctx
    const hintWindow = ctx.open[0] ?? null
    const keyword = v.keyword
    const eliminated = v.me.eliminated === true
    const codeLength = v.keywordLength
    const keywordRemaining = useCountdown(v.keywordDeadlineAt, ctx.clock)
    const keywordCountdownClosed = v.keywordCountdownClosed === true
    const keywordSubmitted = v.me.keywordLocked === true
    let keywordOpen = true
    if (v.keywordDeadlineAt !== null) keywordOpen = keywordRemaining > 0
    if (keywordCountdownClosed) keywordOpen = false

    let keywordSlot: ReactNode = null
    if (eliminated) {
        keywordSlot = (
            <span className="flex h-[3.3cqw] items-center rounded-lg bg-destructive/10 px-[1.2cqw] font-sans font-semibold text-destructive ring-1 ring-destructive/30" style={{ fontSize: pt(12), borderRadius: STRIP_R }}>
                Bạn không giải được từ khóa — bị loại vòng này
            </span>
        )
    } else if (keyword && !keywordSubmitted) {
        keywordSlot = (
            <KeywordBox
                busy={keywordBusy}
                disabled={!keywordOpen}
                onSubmit={(text) => submitKeyword(keyword.questionId, text)}
            />
        )
    }

    const submissions: SubmissionEntry[] = []
    if (v.me.mySubmission) {
        submissions.push({ kind: "answer", answer: v.me.mySubmission.answer, elapsedS: v.me.mySubmission.elapsedS })
    }
    if (v.me.myKeywordSubmission) {
        submissions.push({ kind: "keyword", answer: v.me.myKeywordSubmission.answer, elapsedS: v.me.myKeywordSubmission.elapsedS })
    }

    let timerRemaining: number | null = null
    if (v.keywordDeadlineAt !== null) timerRemaining = keywordRemaining
    else if (hintWindow) {
        if (hintWindow.deadlineAt) timerRemaining = remaining
    }
    let questionText: string | null = null
    if (hintWindow) questionText = hintWindow.question?.questionText ?? null
    let answerSlot: ReactNode = <AnswerBandIdle />
    if (keywordSubmitted) answerSlot = null
    else if (hintWindow && hintWindow.deadlineAt) {
        answerSlot = (
            <AnswerBand
                question={hintWindow.question}
                answered={v.me.answerState === "answered"}
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
            <KeywordLengthBanner length={codeLength} kind={v.keywordKind} code={v.keywordCode ?? null} />

            <HintBars
                openTile={v.me.openTile ?? null}
                pickedTiles={v.me.pickedTiles}
                verdicts={v.me.hintVerdicts}
                answers={v.hintAnswers}
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
                <SubmissionLog entries={submissions} />
            </div>
        </PlayerStage>
    )
}
