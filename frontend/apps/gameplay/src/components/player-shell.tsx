/**
 * PlayerShell — StageShell in PLAYER mode: the OC3.pptm deck, but the drawn
 * control strip is replaced by the player's own ActionBar band — input box,
 * choice-option buttons, buzzer, keyword box, pick-confirm — exactly where the console's
 * buttons used to sit (ui-structure-plan.md ③, decision: same shell, input
 * replaces controls in the ActionBar region).
 *
 * STRUCTURE (Phase 3): this file is now ONLY the shell —
 *   1. the gate (401 / 403 / 409 / loading), drawn by `player-gates`;
 *   2. the waiting room, when `playerScreenOf` says this view is a lobby;
 *   3. one dispatch into the round's module (`src/rounds` owns the rules).
 * The hooks, the gates' facts and the whole `PlayerCtx` bag live in
 * `hooks/use-player-model`; the drawn primitives in `@shared/deck/player-deck`.
 *
 * Players reach the match through THIS app (gameplay), never the portal — the
 * PIN join lives at /join.
 */
import { StageShell } from "@shared/deck/stage-shell"
import { Lobby } from "@shared/deck/lobby"
import { Badges, MainCard, Rail, StageLayout } from "@shared/deck/player-deck"
import { ROUND_LABEL, pt } from "@shared/deck/geometry"
import { gateOf } from "@/lib/player-gate"
import { PlayerGateScreen } from "./player-gates"
import { usePlayerModel } from "@/hooks/use-player-model"

export function PlayerShell({ matchId }: { matchId: string }) {
    const model = usePlayerModel(matchId)

    // ── 1. the gate: a dead session, the wrong seat, or a match not LIVE yet ──
    const gate = gateOf({ failureStatus: model.failureStatus, hasView: model.v !== undefined })
    if (gate) return <PlayerGateScreen gate={gate} model={model} />

    // ── 2. the waiting room — where every ended / unknown / paused round lands ─
    if (model.screen === "lobby") {
        if (model.lobby.data) {
            return (
                <StageShell>
                    <Lobby data={model.lobby.data} meId={model.myId} hint={model.lobbyHint} />
                </StageShell>
            )
        }
        // Lobby still loading: the deck's own waiting card (never a blank canvas).
        const v = model.v!
        return (
            <StageShell>
                <StageLayout rail={<Rail variant="compact" view={v} myId={model.myId} />}>
                    <MainCard>
                        <Badges round={ROUND_LABEL[v.roundId] ?? v.roundId} />
                        <p className="font-sans leading-relaxed text-foreground" style={{ fontSize: pt(16) }}>
                            {model.lobbyHint}
                        </p>
                        <p className="font-sans text-muted-foreground" style={{ fontSize: pt(13) }}>
                            Điểm của bạn: <b className="tabular-nums text-foreground">{v.me.points ?? v.me.score ?? 0}</b>
                        </p>
                    </MainCard>
                </StageLayout>
            </StageShell>
        )
    }

    // ── 3. the round's own screen — one module, one dispatch ──────────────────
    const body = model.render && model.ctx ? model.render(model.ctx) : null
    return <StageShell>{body}</StageShell>
}

export default PlayerShell
