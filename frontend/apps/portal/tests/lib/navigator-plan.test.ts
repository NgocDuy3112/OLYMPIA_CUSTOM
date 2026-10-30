import { describe, expect, it } from "vitest"

import { navigatorStartPlan } from "@/console/navigator-plan"
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
