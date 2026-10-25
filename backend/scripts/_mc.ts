// L4 · the MC's hand, one HTTP call per step.
//
//   npx tsx --env-file=../configs/.env scripts/_mc.ts '{"kind":"khoi-dong.start"}'
//   npx tsx --env-file=../configs/.env scripts/_mc.ts read
//
// Reads the current version first (server truth), so expectedVersion never drifts.
import { readFileSync } from "node:fs";

const BASE = "http://localhost:3000";
const summary = JSON.parse(readFileSync("/tmp/l4-summary.json", "utf8"));
const cookie = readFileSync("/tmp/l4-portal-cookie.txt", "utf8").trim();

async function api<T = any>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${BASE}${path}`, {
        method,
        headers: { "content-type": "application/json", cookie },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text.slice(0, 600)}`);
    return JSON.parse(text) as T;
}

function describe(live: any) {
    return {
        version: live.version,
        roundId: live.roundId,
        stage: live.projection?.stage,
        roundEnded: live.roundEnded,
        open: (live.projection?.open ?? []).map((o: any) => o.questionId.slice(0, 8)),
        oral: live.projection?.oral
            ? `q${live.projection.oral.index + 1}/${live.projection.oral.total} for ${live.projection.oral.playerId.slice(0, 8)}`
            : null,
        me: live.mc,
    };
}

async function main() {
    const arg = process.argv[2];
    const base = `/portal/tournaments/${summary.tournamentId}/matches/${summary.matchId}`;

    if (!arg || arg === "read") {
        const live = await api("GET", `${base}/live`);
        console.log(JSON.stringify(describe(live), null, 1));
        return;
    }

    const action = JSON.parse(arg);
    const live = await api("GET", `${base}/live`);
    await api("POST", `${base}/live/actions`, { expectedVersion: live.version, action });
    const after = await api("GET", `${base}/live`);
    console.log(JSON.stringify({ sent: action.kind, ...describe(after) }, null, 1));
}

void main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});
