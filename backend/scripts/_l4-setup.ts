// L4 setup — ONE four-round match, built entirely through the HTTP API.
//   login (TOTP) → author 49 bank questions → publish them → create the
//   four-round tournament → seat 4 players → create + assemble the match → LIVE.
//
//   npx tsx --env-file=../configs/.env scripts/_l4-setup.ts
//
// Artifacts (outside the repo):
//   /tmp/l4-summary.json        ids, answer key, question map
//   /tmp/l4-portal-cookie.txt   portal_session=…  (the MC)
//   /tmp/l4-gameplay-cookie.txt gameplay_session=… (Demo Player 01)
import { eq } from "drizzle-orm";
import { generateSync } from "otplib";
import { db } from "../src/db/pool.js";
import { tournamentPlayers, users } from "../src/db/schema/index.js";
import { buildApp } from "../src/app.js";
import { signToken } from "../src/lib/jwt.js";

const BASE = "http://localhost:3000";
const NORM = { caseSensitive: false, trim: true, stripAccents: true };

// ── HTTP with a cookie jar ───────────────────────────────────────────────────

let cookie = "";

async function api<T = any>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${BASE}${path}`, {
        method,
        headers: {
            "content-type": "application/json",
            ...(cookie ? { cookie } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const setCookie = res.headers.getSetCookie();
    if (setCookie.length > 0) {
        cookie = setCookie.map((line) => line.split(";")[0]).join("; ");
    }
    const text = await res.text();
    const json = text ? JSON.parse(text) : null;
    if (!res.ok) {
        throw new Error(`${method} ${path} → ${res.status} ${text.slice(0, 400)}`);
    }
    return json as T;
}

async function portalLogin(): Promise<void> {
    const username = process.env.SEED_ADMIN_USERNAME ?? "ADMIN";
    const password = process.env.SEED_ADMIN_PASSWORD;
    if (!password) throw new Error("SEED_ADMIN_PASSWORD missing");

    const login = await api<{ state: string; pendingToken: string }>(
        "POST", "/portal/auth/login", { username, password }
    );

    const [admin] = await db.select().from(users).where(eq(users.username, username)).limit(1);
    if (!admin?.totpSecret) throw new Error("admin has no TOTP secret after login");

    const code = generateSync({ secret: admin.totpSecret });
    await api("POST", "/portal/auth/mfa", { pendingToken: login.pendingToken, code });
    const me = await api<{ role: string }>("GET", "/portal/auth/me");
    console.log(`portal session as ${username} (${me.role})`);
}

// ── the 49 questions ─────────────────────────────────────────────────────────

type Kind = "MC" | "TEXT" | "KEYWORD";
interface Seed {
    roundId: string;
    turnId: string;
    kind: Kind;
    tag: string;
    text: string;
    payload: Record<string, unknown>;
    points?: number;
    answer: { kind: "picked" | "text"; value: string };
}

const mc = (text: string, options: string[], correct: number): Seed["payload"] => ({
    options: options.map((label, i) => ({ id: String.fromCharCode(97 + i), text: label })),
    correctSet: [String.fromCharCode(97 + correct)],
});
const txt = (answer: string): Seed["payload"] => ({ acceptedAnswers: [answer], normalize: NORM });

function seeds(): Seed[] {
    const out: Seed[] = [];

    // khoi-dong · phase 1 — oral, MC (options on every projected screen)
    const p1: Array<[string, string[], number]> = [
        ["Thủ đô của Việt Nam là thành phố nào?", ["Hà Nội", "Đà Nẵng", "Hải Phòng", "Huế"], 0],
        ["Hành tinh nào gần Mặt Trời nhất?", ["Sao Kim", "Sao Thủy", "Sao Hỏa", "Sao Mộc"], 1],
        ["Nước sôi ở 100°C ở áp suất nào?", ["1 atm", "0,5 atm", "2 atm", "3 atm"], 0],
        ["Ai là tác giả của Truyện Kiều?", ["Nguyễn Du", "Tố Hữu", "Xuân Diệu", "Hồ Xuân Hương"], 0],
        ["Nguyên tố hóa học có ký hiệu O là gì?", ["Oxy", "Vàng", "Sắt", "Nitơ"], 0],
        ["Biển nào lớn nhất thế giới?", ["Thái Bình Dương", "Đại Tây Dương", "Ấn Độ Dương", "Bắc Băng Dương"], 0],
    ];
    for (const [text, options, correct] of p1) {
        out.push({
            roundId: "khoi-dong", turnId: "phase1", kind: "MC", tag: "THTH",
            text, payload: mc(text, options, correct),
            answer: { kind: "picked", value: String.fromCharCode(97 + correct) },
        });
    }

    // khoi-dong · phase 2 — typed, TEXT, 60 s shared
    const p2: Array<[string, string]> = [
        ["Sông dài nhất Việt Nam là sông nào?", "sông Hồng"],
        ["Kiến trúc nào là biểu tượng của Paris?", "tháp eiffel"],
                ["Mặt Trời được tạo thành chủ yếu từ khí nào?", "hydro"],
        ["Vitamin C có trong cam chanh gọi là gì?", "axit ascorbic"],
        ["Toán: 7 × 8 = ?", "56"],
        ["Thác Niagara nằm trên biên giới quốc gia nào?", "hoa kỳ"],
    ];
    for (const [text, answer] of p2) {
        out.push({
            roundId: "khoi-dong", turnId: "phase2", kind: "TEXT", tag: "THTH",
            text, payload: txt(answer), answer: { kind: "text", value: answer },
        });
    }

    // giai-ma · 8 hints + the keyword
    const hints: Array<[string, string]> = [
        ["Loài vật nào được gọi là 'kẻ cắp ngủ'?", "gấu"],
        ["Cây nào cho trái màu tím, dùng làm rượu?", "nho"],
        ["Đơn vị đo lường sức mạnh là gì?", "watt"],
        ["Bộ phận nào của cơ thể pump máu?", "tim"],
        ["Quốc gia có hình chiếc ủng?", "italia"],
        ["Hình tam giác có mấy cạnh bằng nhau khi đều?", "ba"],
        ["Màu nào là kết hợp của đỏ và vàng?", "cam"],
        ["Mặt trời mọc ở hướng nào?", "đông"],
    ];
    for (const [text, answer] of hints) {
        out.push({
            roundId: "giai-ma", turnId: "hints", kind: "TEXT", tag: "THTH",
            text, payload: txt(answer), answer: { kind: "text", value: answer },
        });
    }
    out.push({
        roundId: "giai-ma", turnId: "keyword", kind: "KEYWORD", tag: "THTH",
        text: "Từ khóa của vòng Giải mã — gõ chính xác để giành điểm.",
        payload: { code: "OLYMPIA", normalize: NORM },
        answer: { kind: "text", value: "olympia" },
    });

    // but-pha · 4 sprint questions, 30 s each
    const sprint: Array<[string, string]> = [
        ["Toán: 12 × 12 = ?", "144"],
        ["Ký hiệu Au là kim loại gì?", "vàng"],
        ["Số pi lấy 2 chữ số thập phân là?", "3.14"],
        ["Đâu là hành tinh lớn nhất Hệ Mặt Trời?", "mộc"],
    ];
    for (const [text, answer] of sprint) {
        out.push({
            roundId: "but-pha", turnId: "sprint", kind: "TEXT", tag: "THTH",
            text, payload: txt(answer), answer: { kind: "text", value: answer },
        });
    }

    // ve-dich · 6 domains × 4 values — tag = domain, points = face value
    const grid: Record<string, Array<[number, string, string]>> = {
        THTH: [
            [20, "Nước ở 100°C gọi là gì?", "hơi nước"],
            [30, "Điện áp gia đình Việt Nam là bao nhiêu V?", "220"],
            [40, "Con trâu kéo cày dùng sức gì là chính?", "sức kéo"],
            [50, "Vật nào rơi nhanh nhất trong chân không?", "búa"],
        ],
        TNSS: [
            [20, "Rặng san hô lớn nhất thế giới nằm ở nước nào?", "úc"],
            [30, "Sông Nile chảy qua lục địa nào?", "châu phi"],
            [40, "Núi Everest cao bao nhiêu mét (làm tròn 100)?", "8849"],
            [50, "Thác Angel cao nhất thế giới nằm ở nước nào?", "venezuela"],
        ],
        XHPL: [
            [20, "Quốc kỳ có ba màu đỏ, vàng, sao là của nước nào?", "việt nam"],
            [30, "Liên Hợp Quốc thành lập năm nào?", "1945"],
            [40, "Hiến pháp đầu tiên của Mỹ ban hành năm nào?", "1787"],
            [50, "Tòa án Công lý Quốc tế đặt ở thành phố nào?", "the hà"],
        ],
        VHNT: [
            [20, "Truyện 'Lão Hạc' là của tác giả nào?", "nam cao"],
            [30, "Bức tranh Mona Lisa vẽ ai?", "lisa"],
            [40, "Nhạc cụ nào có 88 phím?", "piano"],
            [50, "Bậc thang âm nhạc phương Tây có bảy nốt gọi là gì?", "thang máy"],
        ],
        TTGT: [
            [20, "Đèn giao thông màu nào báo dừng?", "đỏ"],
            [30, "Biển báo hình tam giác warning màu gì?", "vàng"],
            [40, "Khoảng cách an toàn xe chạy 60km/h là?", "30"],
            [50, "Mũ bảo hiểm đạt chuẩn có tem gì?", "cr"],
        ],
        KTTH: [
            [20, "Đơn vị tiền tệ của Nhật Bản là?", "yên"],
            [30, "GDP viết tắt của từ gì?", "tổng sản phẩm quốc nội"],
            [40, "Cung và cầu gặp nhau tạo thành gì?", "cân bằng"],
            [50, "Lãi kép được gọi là gì?", "lãi kép"],
        ],
    };
    for (const [domain, cells] of Object.entries(grid)) {
        for (const [value, text, answer] of cells) {
            out.push({
                roundId: "ve-dich", turnId: "phase1", kind: "TEXT", tag: domain,
                text, payload: txt(answer), points: value,
                answer: { kind: "text", value: answer },
            });
        }
    }
    return out;
}

// ── the rulebook (the format's numbers; engine defaults fill the rest) ───────

const ROUNDS = [
    { id: "khoi-dong", name: "Khởi động", order: 0, chart: "grid" },
    { id: "giai-ma", name: "Giải mã", order: 1, chart: "grid" },
    { id: "but-pha", name: "Bứt phá", order: 2, chart: "grid" },
    { id: "ve-dich", name: "Về đích", order: 3, chart: "grid" },
];

const RULES = {
    "khoi-dong": {
        allowedKinds: ["MC", "TEXT"],
        scoring: { template: "constant", points: 10 },
        turns: [
            { id: "phase1", mode: "oral", delivery: "sequential", questionCount: 6, timeBudgetSeconds: 45 },
            { id: "phase2", mode: "text", delivery: "batch", questionCount: 6, timeBudgetSeconds: 60 },
        ],
    },
    "giai-ma": {
        allowedKinds: ["TEXT", "KEYWORD"],
        scoring: { template: "keyword_derived", initial: 100, dropPerHint: 10, floor: 20, incorrect: 0 },
        turns: [
            { id: "hints", mode: "text", delivery: "batch", hintCount: 8, timeLimitSeconds: 15 },
            { id: "keyword", mode: "text", delivery: "sequential" },
        ],
    },
    "but-pha": {
        allowedKinds: ["TEXT"],
        scoring: {
            template: "rank_multiplier",
            bands: [{ untilSec: 5, points: 15 }, { untilSec: 15, points: 10 }, { untilSec: 30, points: 5 }],
            multipliers: [4, 3, 2],
            ladderTop: 1,
            incorrect: 0,
            timeBasis: "first",
        },
        turns: [{ id: "sprint", mode: "text", delivery: "sequential", questionCount: 4, timeLimitSeconds: 30 }],
    },
    "ve-dich": {
        allowedKinds: ["TEXT"],
        scoring: {
            template: "outcome_multipliers",
            correct: 1,
            incorrect: -0.5,
            powers: {
                hope: { correct: 1.5, incorrect: -1 },
                shield: { correct: 0.5, incorrect: 0 },
            },
        },
        turns: [
            { id: "phase1", mode: "text", delivery: "pick" },
            { id: "phase2", mode: "oral", delivery: "pick", pickCount: 3, buzzWindowSeconds: 5 },
        ],
    },
} as const;

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
    await portalLogin();

    // 1 · author + publish the bank
    const plan = seeds();
    console.log(`authoring ${plan.length} questions…`);
    const bankIds: string[] = [];
    for (const [index, seed] of plan.entries()) {
        const row = await api<{ id: string }>("POST", "/portal/questions", {
            kind: seed.kind,
            questionText: seed.text,
            tag: seed.tag,
            payload: seed.payload,
        });
        await api("PATCH", `/portal/questions/${row.id}/status`, { status: "PENDING" });
        await api("PATCH", `/portal/questions/${row.id}/status`, { status: "PUBLISHED" });
        bankIds.push(row.id);
        if ((index + 1) % 10 === 0) console.log(`  ${index + 1}/${plan.length}`);
    }
    console.log(`  ${plan.length}/${plan.length} published`);

    // 2 · the tournament
    const tournament = await api<{ id: string; slug: string }>("POST", "/portal/tournaments", {
        name: "L4 Playthrough",
        visibility: "PUBLIC",
        tags: ["THTH", "TNSS", "XHPL", "VHNT", "TTGT", "KTTH"],
        stages: [{ id: "l4", title: "L4 Match" }],
        rounds: ROUNDS,
        format: {
            competitorsPerMatch: 4,
            allowedSeatKinds: ["user"],
            teamSize: null,
            teamAggregation: null,
            teamCountAggregation: null,
        },
        placementTiers: [
            { min: 1, max: 1, points: 25 },
            { min: 2, max: 2, points: 18 },
            { min: 3, max: 3, points: 12 },
            { min: 4, max: 4, points: 8 },
        ],
        roundRules: RULES,
    });
    console.log(`tournament ${tournament.id} (${tournament.slug})`);

    // 3 · seat four demo players
    const [demo] = await db.select().from(tournamentPlayers).limit(1);
    const roster = await db
        .select({ id: users.id, name: users.displayName, tv: users.tokenVersion })
        .from(tournamentPlayers)
        .innerJoin(users, eq(tournamentPlayers.userId, users.id))
        .where(eq(tournamentPlayers.tournamentId, demo.tournamentId));
    const players = roster.slice(0, 4);
    await api("POST", `/portal/tournaments/${tournament.id}/players`, {
        userIds: players.map((p) => p.id),
    });
    console.log(`seated: ${players.map((p) => p.name).join(", ")}`);

    // 4 · create + assemble in one call
    const entries = plan.map((seed, index) => ({
        roundId: seed.roundId,
        turnId: seed.turnId,
        sourceId: bankIds[index],
        ...(seed.points === undefined ? {} : { points: seed.points }),
    }));
    const match = await api<{ id: string }>("POST", `/portal/tournaments/${tournament.id}/matches`, {
        kind: "STANDARD",
        stageId: "l4",
        slot: 1,
        label: "L4 Run",
        scheduledAt: new Date(Date.now() + 60_000).toISOString(),
        players: players.map((p, index) => ({ kind: "user", userId: p.id, seed: index + 1 })),
        questions: entries,
    });
    console.log(`match ${match.id} assembled (${entries.length} questions)`);

    // 5 · LIVE
    await api("PATCH", `/portal/tournaments/${tournament.id}/matches/${match.id}/status`, {
        status: "LIVE",
    });
    console.log("match is LIVE");

    // 6 · the player's cookie (Demo Player 01)
    const app = await buildApp();
    await app.ready();
    const gameplayCookie = `gameplay_session=${signToken(app, "GAMEPLAY", {
        sub: players[0].id,
        role: "PLAYER",
        tokenVersion: players[0].tv,
    })}; path=/`;
    await app.close();

    // 7 · answer key: match question id → the right submission
    const detail = await api<{ questions: Array<{ _id: string; sourceId: string }> }>(
        "GET", `/portal/tournaments/${tournament.id}/matches/${match.id}`
    );
    const answerKey: Record<string, Seed["answer"]> = {};
    for (const copy of detail.questions) {
        const index = bankIds.indexOf(copy.sourceId);
        if (index >= 0) answerKey[copy._id] = plan[index].answer;
    }

    const summary = {
        tournamentId: tournament.id,
        slug: tournament.slug,
        matchId: match.id,
        players: players.map((p) => ({ id: p.id, name: p.name })),
        answerKey,
    };
    const { writeFileSync } = await import("node:fs");
    writeFileSync("/tmp/l4-summary.json", JSON.stringify(summary, null, 2));
    writeFileSync("/tmp/l4-portal-cookie.txt", cookie);
    writeFileSync("/tmp/l4-gameplay-cookie.txt", gameplayCookie);
    console.log(`\nsummary → /tmp/l4-summary.json  (${Object.keys(answerKey).length} answers)`);
    console.log(`cookies → /tmp/l4-portal-cookie.txt, /tmp/l4-gameplay-cookie.txt`);
    process.exit(0);
}

void main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});
