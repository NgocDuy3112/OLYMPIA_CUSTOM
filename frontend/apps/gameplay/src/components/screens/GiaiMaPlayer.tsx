import { Band, Badges, MainCard, Rail, Status, Timer, AnswerBand, KeywordBox, VerdictIcon, Box, type PlayerCtx } from "@shared/deck/player-deck"
import { DECK_PAD, STRIP_R, pt } from "@shared/deck/geometry"

// Giải mã (S3): hint window → answer box in the band; otherwise the KEYWORD
// box. Pure: every value comes from the orchestrator's PlayerCtx.
export function GiaiMaPlayer({ ctx }: { ctx: PlayerCtx }) {
    const { v, remaining, myId, flash, answerBusy, submitAnswer, keywordBusy, submitKeyword } = ctx
    const hintWindow = ctx.open[0] ?? null
    const keyword = v.keyword
    const locked = v.me.keywordLocked === true
    const eliminated = v.me.eliminated === true
    const codeLength = keyword?.question?.payload.codeLength ?? null
    const tileX = [0.51, 2.83, 5.15, 7.43]
    const tileY = [1.33, 2.79]
    return (
        <>
            {codeLength !== null && (
                <Box x={0.51} y={0.39} w={8.96} h={0.8} className="flex items-center justify-center rounded-2xl bg-card shadow-md ring-1 ring-border">
                    <span className="font-display font-bold uppercase tracking-wide text-foreground" style={{ fontSize: pt(40) }}>
                        Mật mã gồm có {codeLength} chữ cái
                    </span>
                </Box>
            )}
            {tileY.map((y, row) =>
                tileX.map((x, col) => {
                    const n = row * 4 + col + 1
                    const openTile = hintWindow !== null
                    return (
                        <Box
                            key={n}
                            x={x} y={y} w={2.03} h={1.32}
                            className={`flex items-center justify-center rounded-2xl font-display font-bold leading-none shadow-md ${
                                openTile
                                    ? "bg-muted text-muted-foreground ring-1 ring-border"
                                    : "bg-card text-foreground ring-1 ring-border"
                            }`}
                            style={{ fontSize: pt(60) }}
                        >
                            {n}
                        </Box>
                    )
                }),
            )}
            <MainCard y={4.27} h={2.08}>
                <Badges round="Giải mã" y={4.38} size={28} />
                <Timer y={4.38} size={32} remaining={hintWindow ? remaining : null} fallback="15s" />
                <Box x={0.65} y={4.98} w={8.57} className="font-sans font-medium leading-snug text-foreground" style={{ fontSize: pt(14), ...DECK_PAD }}>
                    {hintWindow
                        ? hintWindow.question?.questionText ?? ""
                        : keyword?.question?.questionText ?? "Chờ MC mở gợi ý"}
                </Box>
            </MainCard>
            <Rail variant="answers" view={v} myId={myId} currentQid={hintWindow?.questionId ?? keyword?.questionId ?? null} />
            <Band slide={3}>
                {hintWindow ? (
                    <AnswerBand
                        slide={3}
                        question={hintWindow.question}
                        answerState={v.me.answerState}
                        verdict={v.me.verdicts?.[hintWindow.questionId]}
                        busy={answerBusy}
                        error={flash}
                        onSubmit={(value) => submitAnswer(hintWindow.questionId, value)}
                    />
                ) : eliminated ? (
                    <span className="flex h-full items-center rounded-lg bg-red-50 px-3 font-sans font-semibold text-red-600 ring-1 ring-red-200" style={{ fontSize: pt(12), borderRadius: STRIP_R }}>
                        Bạn không giải được từ khóa — bị loại vòng này
                    </span>
                ) : locked ? (
                    <span className="inline-flex items-center gap-2 font-sans font-semibold text-emerald-600" style={{ fontSize: pt(13) }}>
                        Đã khóa từ khóa <VerdictIcon verdict={v.me.verdicts?.[keyword?.questionId ?? ""]} />
                    </span>
                ) : keyword ? (
                    <KeywordBox
                        busy={keywordBusy}
                        onSubmit={(text) => submitKeyword(keyword.questionId, text)}
                    />
                ) : (
                    <span className="font-sans text-muted-foreground" style={{ fontSize: pt(12) }}>Chờ MC mở gợi ý.</span>
                )}
            </Band>
            <Status y={7.06} error={flash} hint={hintWindow ? "cửa sổ gợi ý đang mở" : `đã mở ${v.me.hintsRevealed ?? 0} gợi ý`} />
        </>
    )
}
