/**
 * PlayerShell — StageShell in PLAYER mode: the OC3.pptm deck, but the drawn
 * control strip is replaced by the player's own ActionBar band — input box,
 * MC option buttons, buzzer, keyword box, pick-confirm — exactly where the MC's
 * buttons used to sit (ui-structure-plan.md ③, decision: same shell, input
 * replaces controls in the ActionBar region).
 *
 * Transport = docs/live-surface.md § L3: HTTP up, socket down (lib/live).
 * The rail keeps the deck's card geometry with a `me`-highlight ring on this
 * player's own card; everything else (badges, squares, timer, board, tiles) is
 * driven by the pushed LiveView — no static demo data anywhere.
 *
 * STRUCTURE: this file is the ORCHESTRATOR — hooks, gates, derived facts and
 * the per-round switch; the drawn primitives + the band controls live in
 * @shared/deck/player-deck, and each round renders through ONE pure screen in
 * `components/player-screens` (PlayerCtx in, JSX out). Players reach the match
 * through THIS app (gameplay), never the portal — the PIN join lives at /join.
 */
import { useState, type ReactNode } from "react"
import { Link } from "react-router-dom"
import { useCountdown } from "@shared/lib/clock"
import { StageShell } from "@shared/deck/stage-shell"
import { Lobby } from "@shared/deck/lobby"
import { Badges, Gate, MainCard, Rail, StageLayout, type PlayerCtx } from "@shared/deck/player-deck"
import { ROUND_LABEL, isKnownRound, isWaitingStage, pt } from "@shared/deck/geometry"
import { KhoiDongChungPlayer } from "@/components/screens/KhoiDongChungPlayer"
import { KhoiDongRiengPlayer } from "@/components/screens/KhoiDongRiengPlayer"
import { GiaiMaPlayer } from "@/components/screens/GiaiMaPlayer"
import { ButPhaPlayer } from "@/components/screens/ButPhaPlayer"
import { VeDichChungPlayer } from "@/components/screens/VeDichChungPlayer"
import { VeDichPickPlayer } from "@/components/screens/VeDichPickPlayer"
import { VeDichRiengPlayer } from "@/components/screens/VeDichRiengPlayer"
import {
    playerScreenOf,
    useLiveAnswer,
    useLiveKeyword,
    useLiveLobby,
    useLiveMatch,
    useLivePlayerCommand,
    type AnswerValue,
    type LivePlayerCommand,
} from "@/lib/live"
import { useMe } from "@/lib/session"

/** S2 selector: the remembered qid if it is still open, else the clamped index. */
function s2QIndex(qid: string, open: PlayerCtx["open"]): number {
    const found = open.findIndex((entry) => entry.questionId === qid)
    return found >= 0 ? found : -1
}

/** A refusal is a flash, not a crash — 409 means "the window moved on". */
function refusalOf(error: unknown): string | null {
    if (!error) return null
    if (error instanceof Error) return error.message
    return "Không gửi được — thử lại"
}

export function PlayerShell({ matchId }: { matchId: string }) {
    // ── hooks first — early returns must not move the hook line ──────────────
    const me = useMe()
    const live = useLiveMatch(matchId, true)
    const answer = useLiveAnswer(matchId)
    const keywordSubmit = useLiveKeyword(matchId)
    const cmd = useLivePlayerCommand(matchId)

    const [view2, setView2] = useState({ qid: "", idx: 0 })   // S2 question selector (derived reset)
    const [pickedCells, setPickedCells] = useState<string[]>([])  // ve-dich board picks

    const v = live.view
    const open = v?.open ?? []
    const remaining = useCountdown(open[0]?.deadlineAt ?? null, live.clock)
    const myId = me.data?.id ?? null

    // Waiting = no view yet (409: match not LIVE) or a round not running.
    // The lobby answers in BOTH cases — ask for it whenever that's true.
    const failureStatus = live.failure?.status
    const stageNow = v?.stage
    // Reasons the lobby — not a round screen — is what this player should see.
    const matchNotLiveYet = failureStatus === 409 // /live refuses until the match is LIVE
    const noViewToPaint = v === undefined         // the first read/push has not landed
    const roundNotRunning = isWaitingStage(stageNow ?? "")
    const waiting = matchNotLiveYet || noViewToPaint || roundNotRunning
    const lobby = useLiveLobby(matchId, waiting)

    // ── gates (inside the canvas: the deck frame never flickers away) ────────
    if (failureStatus === 401) {
        return (
            <StageShell>
                <Gate title="Chưa vào trận" body="Phiên thí sinh đã hết hạn — nhập lại mã PIN để vào ghế.">
                    <Link to="/join" className="rounded-lg bg-primary px-4 py-2 font-sans text-sm font-semibold text-primary-foreground">Nhập lại mã PIN</Link>
                </Gate>
            </StageShell>
        )
    }
    if (failureStatus === 403) {
        return (
            <StageShell>
                <Gate title="Không có trong trận" body="Ghế này không thuộc về bạn — báo lại với MC.">
                    <Link to="/join" className="rounded-lg bg-primary px-4 py-2 font-sans text-sm font-semibold text-primary-foreground">Nhập mã khác</Link>
                </Gate>
            </StageShell>
        )
    }
    if (failureStatus === 409) {
        // Not LIVE yet — the lobby is the waiting screen (hook keeps polling).
        return (
            <StageShell>
                {lobby.data ? (
                    <Lobby
                        data={lobby.data}
                        meId={myId}
                        hint="Chờ MC mở trận — trang tự cập nhật."
                    />
                ) : (
                    <Gate title="Trận chưa bắt đầu" body="MC chưa mở trận — trang tự cập nhật khi trận sang LIVE.">
                        <button onClick={live.refetch} className="rounded-lg bg-primary px-4 py-2 font-sans text-sm font-semibold text-primary-foreground">Thử lại</button>
                    </Gate>
                )}
            </StageShell>
        )
    }
    if (!v) {
        return (
            <StageShell>
                <Gate title="Đang tải…" body={live.failure?.message ?? "Đọc trạng thái vòng thi"}>
                    {live.failure ? (
                        <button onClick={live.refetch} className="rounded-lg bg-primary px-4 py-2 font-sans text-sm font-semibold text-primary-foreground">Thử lại</button>
                    ) : null}
                </Gate>
            </StageShell>
        )
    }

    // ── derived facts ────────────────────────────────────────────────────────
    const roundId = v.roundId
    const stage = v.stage
    const screen = playerScreenOf(v)
    const flash = refusalOf(answer.error) ?? refusalOf(keywordSubmit.error) ?? refusalOf(cmd.error)
    const nameOf = (id: string) => v.table.find((row) => row.id === id)?.displayName ?? "Thí sinh"

    // S2: which of the batch is on screen (derived: drop a qid that closed)
    const s2Idx = Math.min(view2.idx, Math.max(0, open.length - 1))
    const s2Q = roundId === "khoi-dong" && stage === "phase2" && open[s2QIndex(view2.qid, open)] !== undefined
        ? open[s2QIndex(view2.qid, open)]
        : open[s2Idx]

    // ── waiting / unknown rounds → THE LOBBY ───────────────────────────────────
    if (screen === "lobby") {
        // Why we're waiting: an unknown round or stage says so; an ended round
        // says that; everything else is "waiting for the MC to start".
        const lobbyHint = !isKnownRound(roundId) || stage === "unknown"
            ? "Vòng này chưa có màn hình thí sinh — hỏi MC."
            : stage === "ended"
              ? "Vòng đã kết thúc — chờ MC chuyển vòng."
              : "Chờ MC bắt đầu vòng — trang tự cập nhật."
        if (lobby.data) {
            return (
                <StageShell>
                    <Lobby
                        data={lobby.data}
                        meId={myId}
                        hint={lobbyHint}
                    />
                </StageShell>
            )
        }
        // Lobby still loading: the deck's own waiting card (no flicker of a blank canvas).
        return (
            <StageShell>
                <StageLayout rail={<Rail variant="compact" view={v} myId={myId} />}>
                    <MainCard>
                        <Badges round={ROUND_LABEL[roundId] ?? roundId} />
                        <p className="font-sans leading-relaxed text-foreground" style={{ fontSize: pt(16) }}>
                            {lobbyHint}
                        </p>
                        <p className="font-sans text-muted-foreground" style={{ fontSize: pt(13) }}>
                            Điểm của bạn: <b className="tabular-nums text-foreground">{v.me.points ?? v.me.score ?? 0}</b>
                        </p>
                    </MainCard>
                </StageLayout>
            </StageShell>
        )
    }

    // ── one pure screen per round (components/player-screens) ──────────────────
    const submitAnswer = (questionId: string, value: AnswerValue) => answer.mutate({ questionId, value })
    const submitKeyword = (questionId: string, text: string) => keywordSubmit.mutate({ questionId, value: { text } })
    const command = (action: LivePlayerCommand) => cmd.mutate(action)

    const ctx: PlayerCtx = {
        v,
        stage,
        open,
        remaining,
        myId,
        flash,
        nameOf,
        s2Q,
        s2Idx,
        pickS2: (questionId: string, idx: number) => setView2({ qid: questionId, idx }),
        pickedCells,
        setPickedCells,
        answerBusy: answer.isPending,
        submitAnswer,
        keywordBusy: keywordSubmit.isPending,
        submitKeyword,
        cmdBusy: cmd.isPending,
        command,
    }

    let body: ReactNode
    switch (screen) {
        case "khoi-dong-rieng": body = <KhoiDongRiengPlayer ctx={ctx} />; break
        case "khoi-dong-chung": body = <KhoiDongChungPlayer ctx={ctx} />; break
        case "giai-ma": body = <GiaiMaPlayer ctx={ctx} />; break
        case "but-pha": body = <ButPhaPlayer ctx={ctx} />; break
        case "ve-dich-pick": body = <VeDichPickPlayer ctx={ctx} />; break
        case "ve-dich-chung": body = <VeDichChungPlayer ctx={ctx} />; break
        case "ve-dich-rieng": body = <VeDichRiengPlayer ctx={ctx} />; break
        default: body = null // "lobby" already returned above
    }

    return <StageShell>{body}</StageShell>
}

export default PlayerShell
