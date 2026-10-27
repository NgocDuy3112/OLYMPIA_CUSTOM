import { useState, type CSSProperties, type ReactNode } from "react"

// ── geometry: PPT inches → canvas units ──────────────────────────────────────
const SLIDE_W = 13.3333
const SLIDE_H = 7.5
const px = (i: number) => `${+((i / SLIDE_W) * 100).toFixed(3)}%`
const py = (i: number) => `${+((i / SLIDE_H) * 100).toFixed(3)}%`
/** deck points (sz="NNNN") → container width units (1in = 72pt).
 *  PT_SCALE: global type scale-down (user review: "font size being smaller"). */
const PT_SCALE = 0.75
const pt = (v: number) => `${+(((v * PT_SCALE) / 72 / SLIDE_W) * 100).toFixed(3)}cqw`
/** strip radius: deck roundRect adj 31623 × button height 0.44in */
const STRIP_R = `${+((0.44 * 0.31623) / SLIDE_W * 100).toFixed(3)}cqw`
/** Deck text boxes all carry PowerPoint's default insets (verified across all
 *  406 bodyPr in the deck: 0.1in L/R, 0.05in T/B) — CSS divs have none, which
 *  is why text hugged the card edges. cqw keeps it canvas-absolute. */
const DECK_PAD: CSSProperties = {
    paddingLeft: "0.75cqw",
    paddingRight: "0.75cqw",
    paddingTop: "0.375cqw",
    paddingBottom: "0.375cqw",
}

// ── deck content (verbatim from OC3.pptm; static demo data) ──────────────────
const QUESTION =
    "Năm 1975, khi con người còn mải mê khám phá sức mạnh của công nghiệp khai khoáng, " +
    "sự kiện nào tại Việt Nam đã diễn ra vào cuối tháng 4 năm đó?"

const PLAYERS = [
    { name: "Thí sinh 1", points: 220, initials: "T1" },
    { name: "Thí sinh 2", points: 130, initials: "T2" },
    { name: "Thí sinh 3", points: -30, initials: "T3" },
    { name: "Thí sinh 4", points: 0, initials: "T4" },
]
/** S2 revealed answer lines (⚠ Q4: value format unconfirmed — deck literals). */
const REVEALED = [
    { text: "HOÀNG THÀNH THĂNG LONG LÀ MỘT DI TÍCH Ở HÀ NỘI", value: "20.033" },
    { text: "THIS IS OUR GAME", value: "13.450" },
    { text: "", value: "00.000" },
    { text: "UNESCO", value: "30.000" },
]

const DOMAINS = [
    "Toán học – Tin học",
    "Tự nhiên – Sự sống",
    "Xã hội – Pháp luật",
    "Văn hoá – Nghệ thuật",
    "Thể thao – Giải trí",
    "Kiến thức tổng hợp",
]
const VALUES = [20, 30, 40, 50]
const COL_X = [0.54, 2.03, 3.52, 5.0, 6.49, 7.97]
const ROW_Y = [1.57, 2.31, 3.05, 3.78]
// Stray top-row cells (plan Q3) deliberately DROPPED — default per plan §6.
/** S7 cell strip = this turn's batch (4 cells); S8 draws 3. */
const STRIP_SHARED = [
    { x: 2.7, d: 1, v: 20 },
    { x: 4.2, d: 5, v: 30 },
    { x: 5.66, d: 0, v: 40 },
    { x: 7.14, d: 3, v: 50 },
]
const STRIP_PERSONAL = STRIP_SHARED.slice(1)

// ── shell vocabulary ─────────────────────────────────────────────────────────
export type ScreenId =
    | "s1-kd-personal"
    | "s2-kd-shared"
    | "s3-giai-ma"
    | "s4-but-pha"
    | "s5-board-personal"
    | "s6-board-shared"
    | "s7-q-shared"
    | "s8-q-personal"

const SCREENS: { id: ScreenId; label: string }[] = [
    { id: "s1-kd-personal", label: "S1 · KD cá nhân" },
    { id: "s2-kd-shared", label: "S2 · KD chung" },
    { id: "s3-giai-ma", label: "S3 · Giải mã" },
    { id: "s4-but-pha", label: "S4 · Bứt phá" },
    { id: "s5-board-personal", label: "S5 · Đích bảng cá nhân" },
    { id: "s6-board-shared", label: "S6 · Đích bảng chung" },
    { id: "s7-q-shared", label: "S7 · Đích câu chung" },
    { id: "s8-q-personal", label: "S8 · Đích câu cá nhân" },
]

interface ScreenCtx {
    /** mc mode shows the strip; stage mode strips controls (decision 8). */
    controls: boolean
    /** click-to-select judging target; no ring in stage mode (it's an input). */
    selected: number | null
    onSelect: (i: number) => void
}

// ── primitives ───────────────────────────────────────────────────────────────
function Box({
    x,
    y,
    w,
    h,
    className = "",
    style,
    onClick,
    children,
}: {
    x: number
    y: number
    w?: number
    h?: number
    className?: string
    style?: CSSProperties
    onClick?: () => void
    children?: ReactNode
}) {
    return (
        <div
            className={`absolute ${className}`}
            onClick={onClick}
            style={{
                left: px(x),
                top: py(y),
                ...(w !== undefined ? { width: px(w) } : {}),
                ...(h !== undefined ? { height: py(h) } : {}),
                ...style,
            }}
        >
            {children}
        </div>
    )
}

/** Round name (deck 32pt display) + optional mode badge (16pt). */
function Badges({ round, mode, y = 0.55, size = 32 }: { round: string; mode?: string; y?: number; size?: number }) {
    return (
        <>
            <Box x={0.59} y={y} className="font-display font-bold uppercase leading-none text-foreground" style={{ fontSize: pt(size), ...DECK_PAD }}>
                {round}
            </Box>
            {mode && (
                <Box x={0.6} y={y + 0.42} className="font-display font-medium leading-none text-muted-foreground" style={{ fontSize: pt(16), ...DECK_PAD }}>
                    {mode}
                </Box>
            )}
        </>
    )
}

/**
 * Progress squares (deck 0.26, 12pt, right-aligned ending x 8.46) — question
 * index of the run (plan Q6 assumption): done ▸ active ▸ pending.
 */
function Progress({ total, done, active }: { total: number; done: number; active: number }) {
    const startX = 8.46 - (total * 0.26 + (total - 1) * 0.13)
    return (
        <>
            {Array.from({ length: total }, (_, i) => (
                <Box
                    key={i}
                    x={startX + i * 0.39}
                    y={0.78}
                    w={0.26}
                    h={0.26}
                    className={`flex items-center justify-center font-display font-bold leading-none ${i < done
                            ? "bg-primary text-primary-foreground"
                            : i === active
                                ? "bg-card text-foreground ring-2 ring-primary"
                                : "bg-card text-muted-foreground ring-1 ring-border"
                        }`}
                    style={{ fontSize: pt(12), borderRadius: STRIP_R }}
                >
                    {i + 1}
                </Box>
            ))}
        </>
    )
}

/** Deck timer glyph — bare number, 40pt (32pt on giai-ma's bottom bar). */
function Timer({ x = 8.55, y = 0.51, size = 40, value = "45" }: { x?: number; y?: number; size?: number; value?: string }) {
    return (
        <Box x={x} y={y} w={0.65} className="text-right font-display font-bold leading-none tabular-nums text-foreground" style={{ fontSize: pt(size), ...DECK_PAD }}>
            {value}
        </Box>
    )
}

/** Question text (deck Arial 14pt) + image slot (4.16, 1.46, 4.99×2.85). */
function QuestionBlock() {
    return (
        <>
            <Box x={0.59} y={1.4} w={3.56} h={1.04} className="font-sans font-medium leading-snug text-foreground" style={{ fontSize: pt(14), ...DECK_PAD }}>
                {QUESTION}
            </Box>
            <Box
                x={4.16}
                y={1.46}
                w={4.99}
                h={2.85}
                className="flex items-center justify-center rounded-2xl bg-muted ring-1 ring-border"
            >
                <span className="font-sans text-muted-foreground" style={{ fontSize: pt(12) }}>
                    hình ảnh câu hỏi
                </span>
            </Box>
        </>
    )
}

/**
 * The deck's button strip — EXACT positions per slide (buttons 1.21×0.44 on
 * the band below the card). Decision 3: these are the complete vocabulary.
 * Decision 8: hidden entirely in stage mode.
 */
function Strip({ slide, ctx }: { slide: 1 | 2 | 3 | 4 | 56 | 7 | 8; ctx: ScreenCtx }) {
    if (!ctx.controls) return null
    // per-slide x/y straight from the deck's shape geometry
    const spec: Record<number, { y: number; xs: { x: number; label: string }[] }> = {
        1: { y: 4.69, xs: [{ x: 2.25, label: "Tính giờ" }, { x: 3.59, label: "Đúng" }, { x: 4.92, label: "Sai" }, { x: 6.25, label: "Kết thúc" }] },
        2: { y: 4.69, xs: [{ x: 2.31, label: "Tính giờ" }, { x: 3.65, label: "Đúng" }, { x: 4.98, label: "Sai" }, { x: 6.32, label: "Kết thúc" }] },
        3: { y: 6.52, xs: [{ x: 2.31, label: "Tính giờ" }, { x: 3.65, label: "Đúng" }, { x: 4.98, label: "Sai" }, { x: 6.32, label: "Kết thúc" }] },
        4: { y: 4.68, xs: [{ x: 2.37, label: "Tính giờ" }, { x: 3.71, label: "Đúng" }, { x: 5.04, label: "Sai" }, { x: 6.38, label: "Kết thúc" }] },
        56: { y: 4.9, xs: [{ x: 2.9, label: "Bắt đầu" }, { x: 4.21, label: "Chọn lại" }, { x: 5.49, label: "Kết thúc" }] },
        7: { y: 4.67, xs: [{ x: 2.38, label: "Tính giờ" }, { x: 3.72, label: "Đúng" }, { x: 5.05, label: "Sai" }, { x: 6.38, label: "Kết thúc" }] },
        // S8 adds MỞ CHUÔNG between Tính giờ and Đúng — V2 (S7 has no buzz)
        8: {
            y: 4.67,
            xs: [
                { x: 1.66, label: "Tính giờ" },
                { x: 2.99, label: "Mở chuông" },
                { x: 4.31, label: "Đúng" },
                { x: 5.64, label: "Sai" },
                { x: 6.98, label: "Kết thúc" },
            ],
        },
    }
    const { y, xs } = spec[slide]
    return (
        <>
            {xs.map((b) => (
                <Box
                    key={b.label}
                    x={b.x}
                    y={y}
                    w={1.21}
                    h={0.44}
                    className="flex cursor-default items-center justify-center bg-primary font-sans font-semibold uppercase tracking-wide text-primary-foreground shadow-sm transition hover:brightness-110"
                    style={{ fontSize: pt(11), borderRadius: STRIP_R }}
                >
                    {b.label}
                </Box>
            ))}
        </>
    )
}

// ── right rail ───────────────────────────────────────────────────────────────
interface RailProps {
    variant: "compact" | "answers"
    ctx: ScreenCtx
    /** deck: active/current player ring (S1). */
    activeIdx?: number
    /** S8 power pills on owning cards (deck colors → app semantic accents). */
    powers?: (string | null)[]
    /** S3 keyword-status pill in place of the value row. */
    keywordBadgeIdx?: number
}

/**
 * Contestant cards (x 9.97, w 3.12): compact h 1.24 (S1/5/8) or answer h 1.61
 * (S2/3/4/6/7). These cards ARE the ledger — deck S2/S3/S4 draw answers on
 * them; MC selects a card (ring) then judges with ĐÚNG/SAI (plan §3).
 *
 * Internal layout = the deck's own text-box geometry, not an approximation:
 *   avatar   1.77×1.01 @ (0.16, 0.09)   — deck Picture, square rect
 *   name     1.19×0.37 @ (1.90, 0.03)   — algn=ctr, 16pt display
 *   points   0.83×0.64 @ (2.09, 0.24)   — algn=ctr, 32pt display
 *   value    0.80×0.30 @ (2.09, 0.84)   — algn=ctr, 12pt (answer variant)
 *   badge    0.96×0.21 @ (2.05, 0.88)   — keyword (S3) / power (S8), REPLACES value
 *   answer   3.12×0.50 @ (0,    1.13)   — algn=ctr, full-width bottom line
 */
function Rail({ variant, ctx, activeIdx, powers, keywordBadgeIdx }: RailProps) {
    const ys = variant === "compact" ? [0.39, 1.77, 3.14, 4.55] : [0.39, 2.13, 3.86, 5.61]
    const h = variant === "compact" ? 1.24 : 1.61
    const CW = 3.12
    /** a child box in deck inches (relative to the card) → % of the card */
    const at = (x: number, y: number, w: number, hh: number): CSSProperties => ({
        position: "absolute",
        left: `${+((x / CW) * 100).toFixed(3)}%`,
        top: `${+((y / h) * 100).toFixed(3)}%`,
        width: `${+((w / CW) * 100).toFixed(3)}%`,
        height: `${+((hh / h) * 100).toFixed(3)}%`,
    })
    /** text top-anchored (deck anchor="t"), horizontally centered (algn="ctr") */
    const centered = "flex items-start justify-center text-center leading-tight"

    return (
        <>
            {PLAYERS.map((p, i) => {
                const selected = ctx.selected === i && ctx.controls
                const active = i === activeIdx
                const badge = powers?.[i] ?? (keywordBadgeIdx === i ? "Giải mật mã" : null)
                return (
                    <Box
                        key={p.name}
                        x={9.97}
                        y={ys[i]}
                        w={3.12}
                        h={h}
                        onClick={ctx.controls ? () => ctx.onSelect(i) : undefined}
                        className={`overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-border ${ctx.controls ? "cursor-pointer" : ""
                            } ${selected ? "ring-2 ring-primary" : active ? "ring-2 ring-amber-400" : ""}`}
                    >
                        {/* avatar — deck Picture, fills the card's left side */}
                        <div
                            style={{ ...at(0.16, 0.09, 1.77, 1.01), fontSize: pt(20) }}
                            className="flex items-center justify-center rounded-lg bg-muted font-display font-bold text-muted-foreground"
                            aria-hidden
                        >
                            {p.initials}
                        </div>
                        {/* name — center column, top row */}
                        <div style={{ ...at(1.9, 0.03, 1.19, 0.37), fontSize: pt(16), ...DECK_PAD }} className={`${centered} truncate font-display font-medium text-foreground`}>
                            {p.name}
                        </div>
                        {/* points — same column as the name, sized to dominate the card */}
                        <div style={{ ...at(1.9, 0.24, 1.19, 0.6), fontSize: pt(52), ...DECK_PAD }} className={`${centered} font-display font-bold tabular-nums text-foreground`}>
                            {p.points}
                        </div>
                        {/* badge (S3 keyword / S8 power) sits in the value slot */}
                        {badge ? (
                            <div
                                style={{ ...at(2.05, 0.88, 0.96, 0.21), fontSize: pt(10) }}
                                className={`flex items-center justify-center rounded-full px-1 font-sans font-semibold ${powers?.[i]
                                        ? i === 0
                                            ? "bg-amber-50 text-amber-700 ring-1 ring-amber-300"
                                            : "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-300"
                                        : "bg-primary text-primary-foreground"
                                    }`}
                            >
                                {badge}
                            </div>
                        ) : (
                            variant === "answers" && (
                                <div style={{ ...at(2.09, 0.84, 0.8, 0.3), fontSize: pt(12), ...DECK_PAD }} className={`${centered} font-sans font-semibold tabular-nums text-foreground`}>
                                    {REVEALED[i].value}
                                </div>
                            )
                        )}
                        {/* answer — full-width centered line at the card's bottom */}
                        {variant === "answers" && (
                            <div
                                style={{ ...at(0, 1.13, 3.12, 0.5), fontSize: pt(12), ...DECK_PAD }}
                                className="flex items-start justify-center overflow-hidden text-center font-sans leading-snug text-muted-foreground"
                            >
                                <span className="line-clamp-2">{REVEALED[i].text || "—"}</span>
                            </div>
                        )}
                    </Box>
                )
            })}
        </>
    )
}

// ── the main card ────────────────────────────────────────────────────────────
function MainCard({ y = 0.39, h = 4.12, children }: { y?: number; h?: number; children?: ReactNode }) {
    return (
        <>
            <Box x={0.45} y={y} w={8.96} h={h} className="rounded-2xl bg-card shadow-md ring-1 ring-border" />
            {children}
        </>
    )
}

// ── S1/S2 — KHỞI ĐỘNG ────────────────────────────────────────────────────────
function KhoiDongSlide({ mode, ctx }: { mode: "personal" | "shared"; ctx: ScreenCtx }) {
    return (
        <>
            <MainCard>
                <Badges round="Khởi động" mode={mode === "personal" ? "Lượt cá nhân" : "Lượt chung"} />
                <Progress total={6} done={2} active={2} />
                <Timer />
                <QuestionBlock />
            </MainCard>

            {mode === "personal" ? (
                <Rail variant="compact" ctx={ctx} activeIdx={0} />
            ) : (
                <Rail variant="answers" ctx={ctx} />
            )}
            <Strip slide={mode === "personal" ? 1 : 2} ctx={ctx} />
        </>
    )
}

// ── S3 — GIẢI MÃ ─────────────────────────────────────────────────────────────
function GiaiMaSlide({ ctx }: { ctx: ScreenCtx }) {
    const tileX = [0.51, 2.83, 5.15, 7.43]
    const tileY = [1.33, 2.79]
    const state = (n: number): "free" | "open" | "used" => (n <= 2 ? "used" : n === 3 ? "open" : "free")

    return (
        <>
            {/* keyword banner — LENGTH public (delta D3), deck 40pt */}
            <Box
                x={0.51}
                y={0.39}
                w={8.96}
                h={0.8}
                className="flex items-center justify-center rounded-2xl bg-card shadow-md ring-1 ring-border"
            >
                <span className="font-display font-bold uppercase tracking-wide text-foreground" style={{ fontSize: pt(40) }}>
                    Mật mã gồm có 25 chữ cái
                </span>
            </Box>

            {/* 8 hint tiles — THE picker (free → click → openHint), deck 60pt numbers */}
            {tileY.map((y, row) =>
                tileX.map((x, col) => {
                    const n = row * 4 + col + 1
                    const s = state(n)
                    return (
                        <Box
                            key={n}
                            x={x}
                            y={y}
                            w={2.03}
                            h={1.32}
                            className={`flex items-center justify-center rounded-2xl font-display font-bold leading-none shadow-md ${s === "free"
                                    ? "bg-card text-foreground ring-1 ring-border"
                                    : s === "open"
                                        ? "bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2 ring-offset-background"
                                        : "bg-muted text-muted-foreground ring-1 ring-border"
                                }`}
                            style={{ fontSize: pt(60) }}
                        >
                            {n}
                        </Box>
                    )
                }),
            )}

            {/* question bar at the deck's bottom position (y 4.27, h 2.08) */}
            <MainCard y={4.27} h={2.08}>
                <Badges round="Giải mã" y={4.38} size={28} />
                <Timer y={4.38} size={32} />
                <Box x={0.65} y={4.98} w={8.57} className="font-sans font-medium leading-snug text-foreground" style={{ fontSize: pt(14), ...DECK_PAD }}>
                    {QUESTION}
                </Box>
            </MainCard>

            <Rail variant="answers" ctx={ctx} keywordBadgeIdx={2} />
            <Strip slide={3} ctx={ctx} />
        </>
    )
}

// ── S4 — BỨT PHÁ ─────────────────────────────────────────────────────────────
function ButPhaSlide({ ctx }: { ctx: ScreenCtx }) {
    return (
        <>
            <MainCard>
                <Badges round="Bứt phá" />
                <Progress total={4} done={1} active={1} />
                <Timer />
                <QuestionBlock />
            </MainCard>
            <Rail variant="answers" ctx={ctx} />
            <Strip slide={4} ctx={ctx} />
        </>
    )
}

// ── S5/S6 — VỀ ĐÍCH board ────────────────────────────────────────────────────
function BoardSlide({ mode, ctx }: { mode: "personal" | "shared"; ctx: ScreenCtx }) {
    return (
        <>
            <MainCard h={4.24}>
                <Badges round="Về đích" mode={mode === "personal" ? "Lượt cá nhân" : "Lượt chung"} />
                {/* the board is the PICKER: click a cell → pick (S5/6 strip) */}
                {ROW_Y.map((y, r) =>
                    COL_X.map((x, c) => (
                        <Box
                            key={`${r}-${c}`}
                            x={x}
                            y={y}
                            w={1.33}
                            h={0.59}
                            className={`flex flex-col items-center justify-center rounded-lg bg-card shadow-sm ring-1 ring-border transition ${ctx.controls ? "cursor-pointer hover:bg-accent" : ""
                                }`}
                            style={DECK_PAD}
                        >
                            <span className="truncate text-center font-display leading-tight text-muted-foreground" style={{ fontSize: pt(12) }}>
                                {DOMAINS[c]}
                            </span>
                            <b className="font-display leading-none text-foreground" style={{ fontSize: pt(20) }}>
                                {VALUES[r]}
                            </b>
                        </Box>
                    )),
                )}
            </MainCard>

            <Rail variant={mode === "shared" ? "answers" : "compact"} ctx={ctx} />
            <Strip slide={56} ctx={ctx} />
        </>
    )
}

// ── S7/S8 — VỀ ĐÍCH question ─────────────────────────────────────────────────
function VeDichQuestionSlide({ mode, ctx }: { mode: "shared" | "personal"; ctx: ScreenCtx }) {
    const strip = mode === "shared" ? STRIP_SHARED : STRIP_PERSONAL
    return (
        <>
            <MainCard>
                <Badges round="Về đích" mode={mode === "personal" ? "Lượt cá nhân" : "Lượt chung"} />
                {/* this turn's batch: board where != free (mini cells, deck y 0.65) */}
                {strip.map((c) => (
                    <Box
                        key={`${c.x}-${c.v}`}
                        x={c.x}
                        y={0.65}
                        w={1.33}
                        h={0.59}
                        className="flex flex-col items-center justify-center rounded-lg bg-muted shadow-sm ring-1 ring-border"
                        style={DECK_PAD}
                    >
                        <span className="truncate text-center font-display leading-tight text-muted-foreground" style={{ fontSize: pt(12) }}>
                            {DOMAINS[c.d]}
                        </span>
                        <b className="font-display leading-none text-foreground" style={{ fontSize: pt(20) }}>
                            {c.v}
                        </b>
                    </Box>
                ))}
                <Timer />
                <QuestionBlock />
            </MainCard>

            <Rail
                variant={mode === "shared" ? "answers" : "compact"}
                ctx={ctx}
                activeIdx={mode === "personal" ? 0 : undefined}
                powers={mode === "personal" ? ["Bùa hy vọng", "Bùa bảo hộ", null, null] : undefined}
            />
            {/* V2: S7 exactly as drawn (no buzz) · S8 has MỞ CHUÔNG */}
            <Strip slide={mode === "shared" ? 7 : 8} ctx={ctx} />
        </>
    )
}

// ── screen switch ────────────────────────────────────────────────────────────
function Screen({ id, ctx }: { id: ScreenId; ctx: ScreenCtx }) {
    switch (id) {
        case "s1-kd-personal":
            return <KhoiDongSlide mode="personal" ctx={ctx} />
        case "s2-kd-shared":
            return <KhoiDongSlide mode="shared" ctx={ctx} />
        case "s3-giai-ma":
            return <GiaiMaSlide ctx={ctx} />
        case "s4-but-pha":
            return <ButPhaSlide ctx={ctx} />
        case "s5-board-personal":
            return <BoardSlide mode="personal" ctx={ctx} />
        case "s6-board-shared":
            return <BoardSlide mode="shared" ctx={ctx} />
        case "s7-q-shared":
            return <VeDichQuestionSlide mode="shared" ctx={ctx} />
        case "s8-q-personal":
            return <VeDichQuestionSlide mode="personal" ctx={ctx} />
    }
}

// ── the shell ────────────────────────────────────────────────────────────────
/**
 * The 16:9 stage canvas every surface renders into. Regions (Header · Main ·
 * Rail · ActionBar) are laid out per the deck's coordinates inside it.
 * `controls` is the surface switch: mc = on, stage = off (decision 8);
 * player mode (step 4) reuses the same canvas with input in the ActionBar band.
 */
export function StageShell({ controls = true, children }: { controls?: boolean; children: ReactNode }) {
    void controls // consumed by screens via ctx; the canvas itself is identical
    return (
        <div className="@container relative aspect-video w-full overflow-hidden bg-background">
            {children}
        </div>
    )
}

// ── demo harness (not part of the design) ────────────────────────────────────
const MODE_NOTE: Record<string, string> = {
    mc: "mc mode — the drawn strip is live · click a card to select (Đúng/Sai target)",
    stage: "stage mode — controls stripped: identical view, projector-safe (decision 8)",
}

export function StageShellDemo() {
    const [screen, setScreen] = useState<ScreenId>("s1-kd-personal")
    const [controls, setControls] = useState(true)
    const [selected, setSelected] = useState<number | null>(1)

    const ctx: ScreenCtx = { controls, selected, onSelect: setSelected }

    return (
        <div className="min-h-screen bg-background text-foreground">
            <header className="sticky top-0 z-10 border-b bg-background/95 px-4 py-3 backdrop-blur">
                <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-4 gap-y-2">
                    <span className="font-display text-sm font-bold uppercase tracking-wider text-muted-foreground">
                        StageShell · OC3.pptm · static
                    </span>
                    <nav className="flex flex-wrap gap-1">
                        {SCREENS.map((s) => (
                            <button
                                key={s.id}
                                onClick={() => setScreen(s.id)}
                                className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${screen === s.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                                    }`}
                            >
                                {s.label}
                            </button>
                        ))}
                    </nav>
                    <div className="ml-auto flex rounded-md bg-muted p-0.5">
                        <button
                            onClick={() => setControls(true)}
                            className={`rounded px-2.5 py-1 text-xs font-medium transition ${controls ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
                                }`}
                        >
                            mc · controls
                        </button>
                        <button
                            onClick={() => setControls(false)}
                            className={`rounded px-2.5 py-1 text-xs font-medium transition ${!controls ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
                                }`}
                        >
                            stage · no controls
                        </button>
                    </div>
                </div>
            </header>

            <main className="mx-auto flex max-w-[1600px] flex-col gap-3 px-4 py-5">
                <StageShell controls={controls}>
                    <Screen id={screen} ctx={ctx} />
                </StageShell>
                <p className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{SCREENS.find((s) => s.id === screen)?.label}</span> —{" "}
                    {MODE_NOTE[controls ? "mc" : "stage"]} · static demo, no live data · geometry from OC3.pptm · palette = app tokens · font = SVN-Gratelos
                    Display
                </p>
            </main>
        </div>
    )
}

export default StageShellDemo
