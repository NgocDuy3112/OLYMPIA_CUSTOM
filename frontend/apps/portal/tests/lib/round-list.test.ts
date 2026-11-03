import { describe, expect, it } from "vitest"
import { configsFor, emptyConfig, hasRound, KNOWN_ROUNDS, moveRound, toggleRound, withOrder } from "@/lib/rules"
import type { TournamentRound } from "@/lib/tournaments"

// The round LIST — the tournament's spine. A match going LIVE seeds its live
// record from the FIRST entry, and the rules tab draws one section per entry, so
// a wrong order or a stray id is not cosmetic: it changes what the show plays.

const round = (id: string, order: number): TournamentRound => ({ id, name: id, order, chart: "bars" })

const ids = (list: TournamentRound[]) => list.map((r) => r.id)
const orders = (list: TournamentRound[]) => list.map((r) => r.order)

describe("KNOWN_ROUNDS — only what the deck can draw", () => {
    it("offers exactly the four AOC rounds", () => {
        expect(ids(KNOWN_ROUNDS as TournamentRound[])).toEqual(["khoi-dong", "giai-ma", "but-pha", "ve-dich"])
    })

    it("carries the Vietnamese labels the deck uses", () => {
        expect(KNOWN_ROUNDS.map((r) => r.name)).toEqual(["Khởi động", "Giải mã", "Bứt phá", "Về đích"])
    })
})

describe("toggleRound — adding is an append", () => {
    it("appends a new round at the end, with the next order", () => {
        const list = toggleRound([round("khoi-dong", 0)], "giai-ma", "Giải mã")
        expect(ids(list)).toEqual(["khoi-dong", "giai-ma"])
        expect(orders(list)).toEqual([0, 1])
    })

    it("builds a first round from an empty list", () => {
        expect(ids(toggleRound([], "khoi-dong", "Khởi động"))).toEqual(["khoi-dong"])
    })

    it("removes a chosen round", () => {
        const list = toggleRound([round("khoi-dong", 0), round("giai-ma", 1)], "khoi-dong", "Khởi động")
        expect(ids(list)).toEqual(["giai-ma"])
    })

    it("renumbers after a removal, so the list never has a hole", () => {
        const list = toggleRound(
            [round("khoi-dong", 0), round("giai-ma", 1), round("but-pha", 2)],
            "giai-ma",
            "Giải mã"
        )
        expect(orders(list)).toEqual([0, 1])
        expect(ids(list)).toEqual(["khoi-dong", "but-pha"])
    })

    it("is its own inverse", () => {
        const list = toggleRound(toggleRound([], "ve-dich", "Về đích"), "ve-dich", "Về đích")
        expect(list).toEqual([])
    })
})

describe("moveRound — replay order", () => {
    const start = [round("khoi-dong", 0), round("giai-ma", 1), round("but-pha", 2)]

    it("moves a round up one slot", () => {
        const list = moveRound(start, "giai-ma", -1)
        expect(ids(list)).toEqual(["giai-ma", "khoi-dong", "but-pha"])
        expect(orders(list)).toEqual([0, 1, 2])
    })

    it("moves a round down one slot", () => {
        const list = moveRound(start, "khoi-dong", 1)
        expect(ids(list)).toEqual(["giai-ma", "khoi-dong", "but-pha"])
    })

    it("leaves the list alone at the edges", () => {
        expect(moveRound(start, "khoi-dong", -1)).toBe(start)
        expect(moveRound(start, "but-pha", 1)).toBe(start)
    })

    it("ignores a round that is not in the list", () => {
        expect(moveRound(start, "ve-dich", -1)).toBe(start)
    })

    it("keeps orders contiguous after a move", () => {
        expect(orders(moveRound(start, "but-pha", -1))).toEqual([0, 1, 2])
    })
})

describe("configsFor — rules follow the list", () => {
    it("keeps what the tournament saved for a round", () => {
        const saved = { "khoi-dong": { ...emptyConfig(), allowedKinds: ["TEXT"] as const } }
        const configs = configsFor([round("khoi-dong", 0)], saved as never)
        expect(configs["khoi-dong"].allowedKinds).toEqual(["TEXT"])
    })

    it("seeds the template for a round that has no rules yet", () => {
        const configs = configsFor([round("giai-ma", 0)], null)
        expect(configs["giai-ma"]).toEqual(emptyConfig())
    })

    it("drops the rules of rounds no longer in the list", () => {
        // removing a round must not leave orphan rules in the payload
        const saved = { "khoi-dong": emptyConfig(), "giai-ma": emptyConfig() }
        const configs = configsFor([round("khoi-dong", 0)], saved)
        expect(Object.keys(configs)).toEqual(["khoi-dong"])
    })
})

describe("withOrder / hasRound", () => {
    it("renumbers to 0..n-1 in list order", () => {
        expect(orders(withOrder([round("a", 7), round("b", 3)]))).toEqual([0, 1])
    })

    it("answers membership by id", () => {
        expect(hasRound([round("khoi-dong", 0)], "khoi-dong")).toBe(true)
        expect(hasRound([round("khoi-dong", 0)], "ve-dich")).toBe(false)
    })
})
