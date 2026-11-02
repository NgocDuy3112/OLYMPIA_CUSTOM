import { Badges, CardHeader, ConsoleStage, KeywordLengthBanner, MainCard, Rail, Timer } from "@/components/stage/deck"
import { backToLobbyAction } from "@/components/stage/actions"
import { pt, DECK_PAD } from "@shared/deck/geometry"
import { HINT_TILES, hintTileClass, type HintTile } from "@shared/deck/cells"
import { COPY } from "@shared/deck/copy"

// Giải mã (S3): the hint tile grid (count-driven — any hint count fits), then
// the lower question card, the keyword strip and the ledger rail. Pure: its ctx.
import type { ConsoleQuestion, GiaiMaMc } from "@/lib/live"
import type { ScreenCore } from "../types"

/** Giải mã: hint windows + the typed keyword — NOTHING is auto-scored. */
export type GiaiMaCtx = ScreenCore & {
    remaining: number | null
    questions: ConsoleQuestion[]
    mcGiaiMa: GiaiMaMc | null
    /** multi-select: toggle a card — selected = the CORRECT answerers. */
    toggleSelect: (userId: string) => void
    /** the commits enable once a selected player submitted the question. */
    commitHintReady: boolean
    commitKeywordReady: boolean
    /** Đúng: resolve the open hint with explicit verdicts. */
    commitHint: () => void
    /** Đúng từ khoá: judge the keyword drafts — selected correct, rest wrong. */
    commitKeyword: () => void
}

export function GiaiMaAOCController({ ctx }: { ctx: GiaiMaCtx }) {
    const { v, remaining, questions, baseCards, mcGiaiMa, flash, openRounds } = ctx
    const open = v.projection.open

    const keywordQ = questions.find((q) => q.roundId === "giai-ma" && q.kind === "KEYWORD")
    const keywordLength = typeof keywordQ?.payload.code === "string" ? keywordQ.payload.code.length : null
    const hintQuestions = questions
        .filter((q) => q.roundId === "giai-ma" && q.kind !== "KEYWORD")
        .sort((a, b) => a.position - b.position)
    const openHintId = mcGiaiMa?.openHintId ?? null
    const tileState = (qid: string): HintTile =>
        qid === openHintId ? "open" : mcGiaiMa?.hintsPicked.includes(qid) ? "used" : "free"
    const openHint = (qid: string) => ctx.send({ kind: "giai-ma.openHint", hintId: qid })
    // The board is the show's fixed EIGHT squares (as on the player's deck): the
    // i-th tile is the i-th hint of this round, and a tile past the round's hints
    // is `absent` — inert, never a button, so the count never leaks.
    const tiles = Array.from({ length: HINT_TILES }, (_, i) => hintQuestions[i] ?? null)

    return (
        <ConsoleStage
            rail={<Rail variant="answers" cards={baseCards} onSelect={ctx.toggleSelect} />}
            actions={[
                // Đúng commits the hint window with EXPLICIT verdicts — enabled only
                // when a selected player submitted (nobody selected would mean
                // "everyone wrong", which must never be an accident).
                { label: COPY.correct, onClick: ctx.commitHintReady ? () => ctx.commitHint() : undefined },
                // Sai has no commit of its own: the pair is expressed by the
                // selection (selected = correct), so this slot stays display-only.
                { label: COPY.wrong },
                // Đúng từ khoá: one press judges every keyword draft — selected
                // correct, the rest of the submitters wrong.
                { label: COPY.judgeKeyword, onClick: ctx.commitKeywordReady ? () => ctx.commitKeyword() : undefined },
                backToLobbyAction(ctx.ketThuc),
            ]}
            flash={flash}
        >
            <KeywordLengthBanner length={keywordLength} />

            {/* the tiles: EIGHT fixed squares — a hint count fits without redrawing */}
            <div className="grid min-h-0 flex-1 content-start gap-x-[2.2cqw] gap-y-[1.1cqw]" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
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

            <MainCard className="min-h-[16cqw] flex-none">
                <CardHeader
                    left={<Badges round="Giải mã" size={28} onRoundClick={openRounds} />}
                    right={<Timer remaining={remaining} size={32} />}
                />
                <p className="font-sans font-medium leading-snug text-foreground" style={{ fontSize: pt(14), ...DECK_PAD }}>
                    {open.length > 0 ? open[0].question?.questionText ?? "" : "Chọn một hint để mở cửa sổ trả lời"}
                </p>
            </MainCard>
        </ConsoleStage>
    )
}
