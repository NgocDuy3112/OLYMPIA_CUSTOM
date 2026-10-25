// L4 · ve-dich, both phases, driven over the PLAYER HTTP surface (the exact
// endpoints the browser screens call) + the MC actions route.
//
//   npx tsx --env-file=../configs/.env scripts/_l4-vedich.ts
//
// Phase 1: each turn — current player picks the highest free cell (the engine
// enforces it), types the answer, MC resolves and advances.
// Phase 2: one batch — current player declares HOPE, picks 3, MC opens each,
// someone buzzes inside the 5 s window, MC resolves. Then the MC ends the round.
import { readFileSync } from "node:fs";

const BASE = "http://localhost:3000";
const summary = JSON.parse(readFileSync("/tmp/l4-summary.json", "utf8"));
const tokens = JSON.parse(readFileSync("/tmp/l4-player-tokens.json", "utf8")) as Record<string, string>;
const portalCookie = readFileSync("/tmp/l4-portal-cookie.txt", "utf8").trim();
const { matchId: MID, tournamentId: TID, answerKey } = summary;

async function call<T = any>(method: string, path: string, cookie: string, body?: unknown): Promise<T> {
    const res = await fetch(`${BASE}${path}`, {
        method,
        headers: { "content-type": "application/json", cookie },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text.slice(0, 400)}`);
    return text ? (JSON.parse(text) as T) : (undefined as T);
}

const mc = {
    read: () => call("GET", `/portal/tournaments/${TID}/matches/${MID}/live`, portalCookie),
    act: async (action: Record<string, unknown>) => {
        const live = await mc.read();
        return call("POST", `/portal/tournaments/${TID}/matches/${MID}/live/actions`, portalCookie, {
            expectedVersion: live.version,
            action,
        });
    },
};

const playerView = (userId: string) =>
    call("GET", `/gameplay/matches/${MID}/live`, `gameplay_session=${tokens[userId]}`);
const command = (userId: string, body: Record<string, unknown>) =>
    call("POST", `/gameplay/matches/${MID}/live/commands`, `gameplay_session=${tokens[userId]}`, body);
const answer = (userId: string, questionId: string, value: Record<string, unknown>) =>
    call("POST", `/gameplay/matches/${MID}/live/answers`, `gameplay_session=${tokens[userId]}`, { questionId, value });

const log = (...parts: unknown[]) => console.log("·", ...parts);

async function main() {
    // ── phase 1: four turns, everyone picks the max cell and answers ─────────
    for (let turn = 0; turn < 4; turn++) {
        const live = await mc.read();
        if (live.projection?.stage !== "phase1") break;
        const current: string = live.mc.turnPlayerId;
        const view = await playerView(current);
        const free = (view.board ?? []).filter((c: any) => c.where === "free");
        if (free.length === 0) break;
        const pick = free.reduce((a: any, b: any) => (b.value > a.value ? b : a));
        const token = `gameplay_session=${tokens[current]}`;

        await command(current, { type: "pick", questionId: pick.questionId });
        let after = await playerView(current);
        if ((after.open ?? []).length === 0) {
            await mc.act({ kind: "ve-dich.openQuestion", questionId: pick.questionId });
            after = await playerView(current);
        }
        const openId = after.open[0].questionId;
        const mine = answerKey[openId];
        if (!mine) throw new Error(`no answer in the key for ${openId}`);
        await answer(current, openId, { text: mine.value });

        await mc.act({ kind: "ve-dich.resolve", answerer: true });
        await mc.act({ kind: "ve-dich.advanceTurn" });
        const name = summary.players.find((p: any) => p.id === current)?.name ?? current.slice(0, 8);
        log(`phase1 turn: ${name} picked ${pick.domain} ${pick.value}, answered correct (+${pick.value})`);
        void token;
    }

    // ── phase 2 ──────────────────────────────────────────────────────────────
    // advanceTurn clears pendingPicks — it fires ONCE per batch (after all 3
    // questions), never between them (engine contract, verified in L4).
    const before = await mc.read();
    if (before.projection?.stage === "phase1") {
        await mc.act({ kind: "ve-dich.beginPhase2" });
        log("phase2 begun");
    }

    for (let batch = 0; batch < 3; batch++) {
        const live = await mc.read();
        if (live.projection?.stage !== "phase2") break;
        const current: string = live.mc.turnPlayerId;
        const view = await playerView(current);
        const free = (view.board ?? []).filter((c: any) => c.where === "free").slice(0, 3);
        if (free.length < 3) break;

        await command(current, { type: "pickBatch", questionIds: free.map((c: any) => c.questionId) });
        log(`phase2 batch: ${current.slice(0, 8)} picked [${free.map((c: any) => `${c.domain}${c.value}`).join(", ")}]`);

        const mayHope = (view.me.powersLeft ?? []).includes("HOPE");
        for (const [index, cell] of free.entries()) {
            await mc.act({ kind: "ve-dich.openQuestion", questionId: cell.questionId });

            if (index === 0 && mayHope) {
                await command(current, { type: "power", power: "HOPE" });
                log("power HOPE declared by the answerer");
            }

            // The answer is oral; the MC holds the verdict. Close, then a buzz
            // from another seat inside the 5 s window.
            await mc.act({ kind: "ve-dich.closeCurrentAnswer" });

            const others = summary.players.map((p: any) => p.id).filter((id: string) => id !== current);
            let buzzer: string | null = null;
            for (const candidate of others) {
                try {
                    await command(candidate, { type: "buzz", questionId: cell.questionId });
                    buzzer = candidate;
                    break;
                } catch {
                    // window already closed — try the next seat
                }
            }
            log(`  ${cell.domain}${cell.value}: ${buzzer ? `buzzer ${buzzer.slice(0, 8)}` : "no buzz"}`);

            await mc.act({
                kind: "ve-dich.resolve",
                answerer: true,
                ...(buzzer ? { buzzer: true } : {}),
            });
        }
        await mc.act({ kind: "ve-dich.advanceTurn" });
    }

    // ── end the round ────────────────────────────────────────────────────────
    await mc.act({ kind: "ve-dich.endRound" });
    const final = await mc.read();
    log("ve-dich ended · stage", final.projection?.stage, "· roundEnded", final.roundEnded);
    const table = final.projection?.table ?? [];
    log("table:", table.map((r: any) => `${r.displayName}=${r.points}`).join(" · "));
    process.exit(0);
}

void main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});
