import { describe, expect, it } from "vitest"

import { expandRoundEntries, navigatorStartPlan } from "@/console/navigator-plan"
import type { LobbyData } from "@/lib/live"

// The rounds navigator's click: what the controller sends to open a round.
// Pure (table-tested) — the model only executes the plan.

const lobby = (over: Partial<LobbyData> = {}): LobbyData => ({
    title: "T",
    label: "L",
    status: "LIVE",
    roundId: "khoi-dong",
    rounds: [
        { id: "khoi-dong", name: "Khởi động", status: "playing" },
        { id: "giai-ma", name: "Giải mã", status: "new" },
        { id: "but-pha", name: "Bứt phá", status: "ended" },
    ],
    table: [],
    connected: [],
    ...over,
})

const start = { kind: "giai-ma.start" }

describe("navigatorStartPlan — what a round button sends", () => {
    it("the ACTIVE fresh round starts bare — no navigation needed", () => {
        const l = lobby({ roundId: "giai-ma" })
        expect(navigatorStartPlan(l, "giai-ma", start)).toEqual([start])
    })

    it("a fresh, non-active round: go there AND start it", () => {
        expect(navigatorStartPlan(lobby(), "giai-ma", start))
            .toEqual([{ kind: "round.goTo", roundId: "giai-ma" }, start])
    })

    it("a mid-play round re-opens its saved state — no fresh start", () => {
        expect(navigatorStartPlan(lobby(), "khoi-dong", start))
            .toEqual([{ kind: "round.goTo", roundId: "khoi-dong" }])
    })

    it("a finished round re-opens (archive) — no fresh start", () => {
        expect(navigatorStartPlan(lobby(), "but-pha", start))
            .toEqual([{ kind: "round.goTo", roundId: "but-pha" }])
    })

    it("a round the lobby doesn't list still gets go+start (defensive)", () => {
        expect(navigatorStartPlan(lobby(), "mystery", { kind: "mystery.start" }))
            .toEqual([{ kind: "round.goTo", roundId: "mystery" }, { kind: "mystery.start" }])
    })
})

describe("expandRoundEntries — Khởi động/Về đích become phase pairs", () => {
    const rounds = [
        { id: "khoi-dong", name: "Khởi động", status: "new" as const },
        { id: "giai-ma", name: "Giải mã", status: "new" as const },
        { id: "but-pha", name: "Bứt phá", status: "ended" as const },
        { id: "ve-dich", name: "Về đích", status: "playing" as const },
    ]

    it("splits the two phase rounds, keeps the others single", () => {
        const entries = expandRoundEntries(rounds)
        expect(entries.map((e) => e.name)).toEqual([
            "Khởi động · Riêng", "Khởi động · Chung",
            "Giải mã",
            "Bứt phá",
            "Về đích · Chung", "Về đích · Riêng",
        ])
        expect(entries.map((e) => e.phase)).toEqual([1, 2, undefined, undefined, 1, 2])
    })

    it("pair entries share the round id (start/goTo still target the round)", () => {
        const entries = expandRoundEntries(rounds)
        const kd = entries.filter((e) => e.id === "khoi-dong")
        expect(kd).toHaveLength(2)
        expect(new Set(entries.map((e) => `${e.id}:${e.name}`)).size).toBe(entries.length) // keys stay unique
    })

    it("the phase order matches each round's rule (khoi-dong riêng→chung, ve-dich chung→riêng)", () => {
        const entries = expandRoundEntries(rounds)
        expect(entries.find((e) => e.id === "khoi-dong" && e.phase === 1)?.name).toContain("Riêng")
        expect(entries.find((e) => e.id === "ve-dich" && e.phase === 1)?.name).toContain("Chung")
        expect(entries.find((e) => e.id === "ve-dich" && e.phase === 2)?.name).toContain("Riêng")
    })

    it("is idempotent — already-split entries pass through, never double-splitting", () => {
        const once = expandRoundEntries(rounds)
        const twice = expandRoundEntries(once)
        expect(twice).toEqual(once) // stale/prepared data can't spawn phantom buttons
        expect(twice).toHaveLength(6)
        expect(twice.map((e) => e.name)).not.toContain("Khởi động · Riêng · Riêng")
    })
})
