import { AnswerBand, Badges, CardHeader, KeywordBox, KeywordLengthBanner, MainCard, PlayerStage, Rail, Timer, VerdictIcon, type PlayerCore } from "@shared/deck/player-deck"
import { DECK_PAD, STRIP_R, pt } from "@shared/deck/geometry"
import { HINT_TILES, playerHintTileClass } from "@shared/deck/cells"
import type { AnswerValue } from "@shared/deck/types"

// Giải mã (S3): keyword banner, the count-driven hint tile grid, the lower
// question card, and a band that is either the hint answer box or the keyword
// box. Pure: every value comes from the orchestrator, narrowed here.
export type GiaiMaPlayerCtx = PlayerCore & {
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

    return (
        <PlayerStage
            rail={<Rail variant="answers" view={v} myId={myId} currentQid={hintWindow?.questionId ?? keyword?.questionId ?? null} />}
            band={
                hintWindow ? (
                    <AnswerBand
                        question={hintWindow.question}
                        answerState={v.me.answerState}
                        verdict={v.me.verdicts?.[hintWindow.questionId]}
                        busy={answerBusy}
                        error={flash}
                        onSubmit={(value) => submitAnswer(hintWindow.questionId, value)}
                    />
                ) : eliminated ? (
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
                    <span className="font-sans text-muted-foreground" style={{ fontSize: pt(12) }}>Chờ MC mở gợi ý.</span>
                )
            }
            hint={hintWindow ? "cửa sổ hint đang mở" : `đã mở ${v.me.hintsRevealed ?? 0} gợi ý`}
            flash={flash}
        >
            <KeywordLengthBanner length={codeLength} />

            {/* the tiles: display squares — muted while a hint window is open */}
            <div className="grid min-h-0 flex-1 content-start gap-x-[2.2cqw] gap-y-[1.1cqw]" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
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

            <MainCard className="min-h-[16cqw] flex-none">
                <CardHeader
                    left={<Badges round="Giải mã" size={28} />}
                    right={<Timer remaining={remaining} size={32} />}
                />
                <p className="font-sans font-medium leading-snug text-foreground" style={{ fontSize: pt(14), ...DECK_PAD }}>
                    {hintWindow
                        ? hintWindow.question?.questionText ?? ""
                        : keyword?.question?.questionText ?? "Chờ MC mở gợi ý"}
                </p>
            </MainCard>
        </PlayerStage>
    )
}
