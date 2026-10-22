import { GIAI_MA_DEFAULTS } from "../../../src/game/engine/rules.js";
import { describe, expect, it } from "vitest";
import {
    canPlayerAnswer,
    closeHintWindow,
    isWindowOpen,
    endGiaiMa,
    giaiMaPoints,
    keywordValueFor,
    openHint,
    remainingHints,
    resolveOpenHint,
    startGiaiMa,
    submitKeyword,
    type GiaiMaState
} from "../../../src/game/engine/turns/giai-ma.js";
import { RuleError } from "../../../src/game/engine/turns/errors.js";

function codeOf(fn: () => unknown): string {
    try { fn(); } catch (e) {
        if (e instanceof RuleError) return e.code;
        throw e;
    }
    return "NO_ERROR";
}

const H = ["h1", "h2", "h3", "h4", "h5", "h6", "h7", "h8"];
const NOW = "2026-01-01T00:00:00.000Z";
const at = (sec: number) => new Date(Date.parse(NOW) + sec * 1000).toISOString();

// The MC opens a hint window, players answer, the MC resolves it.
function playHints(
    ids: string[],
    hintOrder: string[],
    answers: (hint: string, playerId: string) => boolean
): GiaiMaState {
    let s = startGiaiMa(ids, H);
    for (const hint of hintOrder) {
        if (s.stage !== "hints") break;
        s = openHint(s, hint, NOW);
        const byPlayer = Object.fromEntries(
            s.players.filter((p) => !p.keywordLocked).map((p) => [p.id, answers(hint, p.id)])
        );
        s = resolveOpenHint(s, byPlayer);
    }
    return s;
}

describe("giai-ma — setup", () => {
    it("accepts any player count (no engine-level restriction)", () => {
        expect(codeOf(() => startGiaiMa(["a"], H))).toBe("NO_ERROR");
        expect(codeOf(() => startGiaiMa(["a", "b", "c", "d", "e"], H))).toBe("NO_ERROR");
    });

    it("starts at keyword 100 with no open hint", () => {
        const s = startGiaiMa(["a", "b"], H);
        expect(keywordValueFor(s, "a")).toBe(100);
        expect(s.picked).toEqual([]);
        expect(s.openHint).toBeNull();
    });
});

describe("giai-ma — hint windows", () => {
    it("the MC may open hints in any order", () => {
        let s = openHint(startGiaiMa(["a"], H), "h5", NOW);
        expect(s.openHint).toBe("h5");
        s = resolveOpenHint(s, { a: true });
        s = openHint(s, "h1", NOW);
        expect(s.openHint).toBe("h1");
        expect(s.picked).toEqual(["h5"]);
    });

    it("only one window may be open at a time", () => {
        const s = openHint(startGiaiMa(["a"], H), "h1", NOW);
        expect(codeOf(() => openHint(s, "h2", NOW))).toBe("WINDOW_OPEN");
    });

    it("a hint already picked cannot be opened again", () => {
        const s = resolveOpenHint(openHint(startGiaiMa(["a"], H), "h1", NOW), { a: true });
        expect(codeOf(() => openHint(s, "h1", NOW))).toBe("HINT_CONSUMED");
    });

    it("resolving without an open window is rejected", () => {
        expect(codeOf(() => resolveOpenHint(startGiaiMa(["a"], H), { a: true })))
            .toBe("NO_OPEN_HINT");
    });

    it("the MC may close a window without resolving; the hint stays available", () => {
        let s = openHint(startGiaiMa(["a"], H), "h3", NOW);
        s = closeHintWindow(s);
        expect(s.openHint).toBeNull();
        expect(remainingHints(s)).toContain("h3");
        expect(s.picked).toEqual([]);
    });

    it("closing when no window is open is rejected", () => {
        expect(codeOf(() => closeHintWindow(startGiaiMa(["a"], H)))).toBe("NO_OPEN_HINT");
    });
});

describe("giai-ma — resolution and reveals", () => {
    it("a correct answer reveals the hint to that player only and lowers only their keyword", () => {
        let s = openHint(startGiaiMa(["a", "b"], H), "h1", NOW);
        s = resolveOpenHint(s, { a: true, b: false });
        expect(keywordValueFor(s, "a")).toBe(90);
        expect(keywordValueFor(s, "b")).toBe(100);
        expect(s.players.find((p) => p.id === "a")!.revealed).toEqual(["h1"]);
        expect(s.players.find((p) => p.id === "b")!.revealed).toEqual([]);
    });

    it("a missing answer counts as wrong: no reveal, no drop", () => {
        let s = openHint(startGiaiMa(["a", "b"], H), "h1", NOW);
        s = resolveOpenHint(s, { a: true });         // b never answered
        expect(keywordValueFor(s, "b")).toBe(100);
        expect(s.players.find((p) => p.id === "b")!.revealed).toEqual([]);
    });

    it("a locked player is not revealed the hint", () => {
        let s = submitKeyword(startGiaiMa(["a", "b"], H), "a", false);   // a is out
        s = openHint(s, "h1", NOW);
        s = resolveOpenHint(s, { a: true, b: true });
        expect(s.players.find((p) => p.id === "a")!.revealed).toEqual([]);
        expect(s.players.find((p) => p.id === "b")!.revealed).toEqual(["h1"]);
    });

    it("the round ends once all hints are resolved", () => {
        const s = playHints(["a", "b"], H, () => false);
        expect(s.stage).toBe("ended");
        expect(remainingHints(s)).toHaveLength(0);
    });
});

describe("giai-ma — keyword submission", () => {
    it("a correct submission earns the value at that moment and locks it", () => {
        let s = startGiaiMa(["a", "b"], H);
        s = resolveOpenHint(openHint(s, "h1", NOW), { a: true, b: false });
        s = resolveOpenHint(openHint(s, "h2", NOW), { a: true, b: false });
        s = submitKeyword(s, "a", true);      // a at 80
        expect(giaiMaPoints(s, "a")).toBe(80);
        expect(s.players.find((p) => p.id === "a")!.keywordLocked).toBe(true);
    });

    it("a wrong submission earns 0 and eliminates the player", () => {
        const s = submitKeyword(startGiaiMa(["a", "b"], H), "a", false);
        expect(giaiMaPoints(s, "a")).toBe(0);
        expect(s.players.find((p) => p.id === "a")!.eliminated).toBe(true);
    });

    it("each player submits at most once", () => {
        const s = submitKeyword(startGiaiMa(["a", "b"], H), "a", false);
        expect(codeOf(() => submitKeyword(s, "a", true))).toBe("ALREADY_SUBMITTED");
    });

    it("the round ends when everyone has submitted", () => {
        let s = submitKeyword(startGiaiMa(["a", "b"], H), "a", true);
        expect(s.stage).toBe("hints");
        s = submitKeyword(s, "b", false);
        expect(s.stage).toBe("ended");
    });

    it("no submissions after the round has ended", () => {
        const s = endGiaiMa(startGiaiMa(["a", "b"], H));
        expect(codeOf(() => submitKeyword(s, "a", true))).toBe("WRONG_STAGE");
    });
});

describe("giai-ma — worked payouts", () => {
    it("a answers h1, h4, h7 correctly (70); b answers h2 correctly (90)", () => {
        const s = playHints(["a", "b"], H, (hint, who) => {
            if (who === "a") return hint === "h1" || hint === "h4" || hint === "h7";
            if (who === "b") return hint === "h2";
            return false;
        });
        expect(keywordValueFor(s, "a")).toBe(70);
        expect(keywordValueFor(s, "b")).toBe(90);
    });
});

describe("giai-ma — the 15 s window", () => {
    it("is open at the moment it opens and just inside 15 s", () => {
        const s = openHint(startGiaiMa(["a"], H), "h1", NOW);
        expect(isWindowOpen(s, NOW)).toBe(true);
        expect(isWindowOpen(s, at(GIAI_MA_DEFAULTS.hintWindowS))).toBe(true);
    });

    it("is closed past 15 s", () => {
        const s = openHint(startGiaiMa(["a"], H), "h1", NOW);
        expect(isWindowOpen(s, at(GIAI_MA_DEFAULTS.hintWindowS + 0.001))).toBe(false);
    });

    it("is closed when no window is open", () => {
        expect(isWindowOpen(startGiaiMa(["a"], H), NOW)).toBe(false);
    });

    it("resolving and closing both end the window", () => {
        const resolved = resolveOpenHint(openHint(startGiaiMa(["a"], H), "h1", NOW), { a: true });
        expect(isWindowOpen(resolved, NOW)).toBe(false);
        const closed = closeHintWindow(openHint(startGiaiMa(["a"], H), "h1", NOW));
        expect(isWindowOpen(closed, NOW)).toBe(false);
    });
});

describe("giai-ma — who may answer", () => {
    it("an active player may answer while the window is open", () => {
        const s = openHint(startGiaiMa(["a", "b"], H), "h1", NOW);
        expect(canPlayerAnswer(s, "a", NOW)).toBe(true);
    });

    it("nobody may answer once the window has closed", () => {
        const s = openHint(startGiaiMa(["a"], H), "h1", NOW);
        expect(canPlayerAnswer(s, "a", at(20))).toBe(false);
    });

    it("a player who submitted their keyword may not answer", () => {
        let s = submitKeyword(startGiaiMa(["a", "b"], H), "a", true);
        s = openHint(s, "h1", NOW);
        expect(canPlayerAnswer(s, "a", NOW)).toBe(false);
        expect(canPlayerAnswer(s, "b", NOW)).toBe(true);
    });

    it("an eliminated player may not answer", () => {
        let s = submitKeyword(startGiaiMa(["a", "b"], H), "a", false);
        s = openHint(s, "h1", NOW);
        expect(canPlayerAnswer(s, "a", NOW)).toBe(false);
    });

    it("a player who is not in the round may not answer", () => {
        const s = openHint(startGiaiMa(["a"], H), "h1", NOW);
        expect(canPlayerAnswer(s, "stranger", NOW)).toBe(false);
    });
});
