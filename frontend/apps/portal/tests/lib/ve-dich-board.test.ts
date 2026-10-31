import { describe, expect, it } from "vitest"

import { sortVeCells, VE_DOMAINS } from "@shared/deck/ve-dich-board"

// The show table's order — the MC's grid and the contestant's grid must line
// up cell-for-cell (pure, table-tested).

interface Cell { domain: string; value: number }
const c = (domain: string, value: number): Cell => ({ domain, value })

describe("sortVeCells — the 6×4 show matrix", () => {
    it("rows by score band first (20 top), columns by canonical domain", () => {
        const scrambled = [
            c("KTTH", 50), c("THTH", 20), c("TNSS", 50), c("THTH", 50),
            c("XHPL", 30), c("TNSS", 20),
        ]
        const sorted = sortVeCells(scrambled, (x) => x.domain, (x) => x.value)

        expect(sorted.map((x) => x.value)).toEqual([20, 20, 30, 50, 50, 50])
        // within a band: THTH before TNSS before XHPL before KTTH
        expect(sorted.slice(2)).toEqual([c("XHPL", 30), c("THTH", 50), c("TNSS", 50), c("KTTH", 50)])
    })

    it("keeps the engine's domain order as the column order", () => {
        const sorted = sortVeCells(
            [...VE_DOMAINS].map((domain) => c(domain, 20)).reverse(),
            (x) => x.domain,
            (x) => x.value
        )
        expect(sorted.map((x) => x.domain)).toEqual([...VE_DOMAINS])
    })

    it("custom domains sort last, alphabetically — never crash the board", () => {
        const sorted = sortVeCells(
            [c("ZZZ", 20), c("AAA", 20), c("THTH", 20)],
            (x) => x.domain,
            (x) => x.value
        )
        expect(sorted.map((x) => x.domain)).toEqual(["THTH", "AAA", "ZZZ"])
    })

    it("does not mutate its input", () => {
        const input = [c("KTTH", 50), c("THTH", 20)]
        const copy = [...input]
        sortVeCells(input, (x) => x.domain, (x) => x.value)
        expect(input).toEqual(copy)
    })
})
