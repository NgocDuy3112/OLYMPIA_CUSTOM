import { AnswerBand, AnswerBandIdle, KeywordBox, KeywordLengthBanner, PlayerStage, QuestionCard, Rail, Timer, VerdictIcon, type PlayerCore } from "../player-deck"
import { STRIP_R, pt } from "../geometry"
import { HINT_TILES, playerHintTileClass } from "../cells"
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
    const eliminated = v.me.eliminated === true
    const codeLength = keyword?.question?.payload.codeLength ?? null

    const keywordSlot = eliminated ? (
        <span className="flex h-[3.3cqw] items-center rounded-lg bg-red-50 px-[1.2cqw] font-sans font-semibold text-red-600 ring-1 ring-red-200" style={{ fontSize: pt(12), borderRadius: STRIP_R }}>
            Bạn không giải được từ khóa — bị loại vòng này
        </span>
    ) : locked ? (
        <span className="inline-flex items-center gap-[0.5cqw] font-sans font-semibold text-emerald-600" style={{ fontSize: pt(12) }}>
            Đã khóa từ khóa <VerdictIcon verdict={v.me.verdicts?.[keyword?.questionId ?? ""]} />
        </span>
    ) : keyword ? (
        <KeywordBox
            busy={keywordBusy}
            onSubmit={(text) => submitKeyword(keyword.questionId, text)}
        />
    ) : (
        <span className="font-sans text-muted-foreground" style={{ fontSize: pt(12) }}>Chờ điều hành mở gợi ý.</span>
    )

    return (
        <PlayerStage
            rail={<Rail variant="answers" view={v} myId={myId} currentQid={hintWindow?.questionId ?? keyword?.questionId ?? null} />}
        >
            <KeywordLengthBanner length={codeLength} />

            <div
                className="grid min-h-0 flex-1 gap-x-[2.2cqw] gap-y-[1.1cqw]"
                style={{
                    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                    // rows share the leftover height, so the tiles fill the gap
                    // instead of leaving a dead band above the card
                    gridTemplateRows: `repeat(${Math.ceil(HINT_TILES / 4)}, minmax(0, 1fr))`,
                }}
            >
                {Array.from({ length: HINT_TILES }, (_, i) => i + 1).map((n) => (
                    <div
                        key={n}
                        className={playerHintTileClass(hintWindow !== null)}
                        style={{ fontSize: pt(60) }}
                    >
                        {n}
                    </div>
                ))}
            </div>

            <QuestionCard
                round="Giải mã"
                size={28}
                right={<Timer remaining={hintWindow?.deadlineAt ? remaining : null} size={32} />}
                question={
                    hintWindow
                        ? hintWindow.question?.questionText ?? ""
                        : keyword?.question?.questionText ?? "Chờ điều hành mở gợi ý"
                }
                answer={v.revealed?.answer}
                className="min-h-[16cqw] flex-none"
                footer={
                    <div className="flex w-full flex-col gap-[0.7cqw]">
                        {hintWindow ? (
                            <AnswerBand
                                question={hintWindow.question}
                                answerState={v.me.answerState}
                                verdict={v.me.verdicts?.[hintWindow.questionId]}
                                disabled={remaining <= 0}
                                busy={answerBusy}
                                error={flash}
                                onSubmit={(value) => submitAnswer(hintWindow.questionId, value)}
                            />
                        ) : (
                            <AnswerBandIdle />
                        )}
                        {keywordSlot}
                    </div>
                }
            />
        </PlayerStage>
    )
}
