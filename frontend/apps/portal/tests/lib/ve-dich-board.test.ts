import { describe, expect, it } from "vitest"

import { VE_BOARD, VE_GRID_COLUMNS, VE_VALUES, boardRows, stripCellsOf } from "@shared/deck/ve-dich-board"

// The show board — 6×20, 6×30, 4×40, 4×50 — and the row/span arithmetic that
// keeps it balanced. The the console's grid and the player's picker both go through
// here, so a cell must land in the same row on both surfaces.

interface Cell { questionId: string; value: number; where?: string }
const c = (questionId: string, value: number, where = "free"): Cell => ({ questionId, value, where })

// A real board: exactly the composition the backend enforces at start.
const BOARD: Cell[] = [
    ...Array.from({ length: 6 }, (_, i) => c(`q20-${i}`, 20)),
    ...Array.from({ length: 6 }, (_, i) => c(`q30-${i}`, 30)),
    ...Array.from({ length: 4 }, (_, i) => c(`q40-${i}`, 40)),
    ...Array.from({ length: 4 }, (_, i) => c(`q50-${i}`, 50)),
]

describe("the board's composition", () => {
    it("is 6×20, 6×30, 4×40, 4×50 — twenty cells, bands top-down", () => {
        expect(VE_BOARD.map((band) => [band.value, band.count])).toEqual([[20, 6], [30, 6], [40, 4], [50, 4]])
        expect(VE_VALUES).toEqual([20, 30, 40, 50])
        expect(BOARD).toHaveLength(20)
    })

    it("every row fills the SAME grid width — that is what 'balanced' means here", () => {
        for (const band of VE_BOARD) {
            expect(band.count * band.span).toBe(VE_GRID_COLUMNS)
        }
        // the higher bands are WIDER, not taller (height is fixed in cells.ts)
        expect(VE_BOARD[3].span).toBeGreaterThan(VE_BOARD[0].span)
    })
})

describe("boardRows", () => {
    it("groups into one row per band, in board order", () => {
        const rows = boardRows(BOARD, (cell) => cell.value)
        expect(rows.map((row) => row.value)).toEqual([20, 30, 40, 50])
        expect(rows.map((row) => row.cells.length)).toEqual([6, 6, 4, 4])
        expect(rows.map((row) => row.span)).toEqual([2, 2, 3, 3])
    })

    it("keeps the input order inside a band — the server's frozen order is the board's", () => {
        const scrambled = [c("b", 20), c("a", 20), c("c", 30)]
        const rows = boardRows(scrambled, (cell) => cell.value)
        expect(rows[0].cells.map((cell) => cell.questionId)).toEqual(["b", "a"])
        expect(rows[1].cells.map((cell) => cell.questionId)).toEqual(["c"])
    })

    it("skips a band the board has no cells for — no empty rows drawn", () => {
        const rows = boardRows([c("only", 40)], (cell) => cell.value)
        expect(rows.map((row) => row.value)).toEqual([40])
    })

    it("an unforeseen face value still draws, in its own row — never silently dropped", () => {
        const rows = boardRows([c("odd", 60), c("q20-0", 20)], (cell) => cell.value)
        expect(rows.map((row) => row.value)).toEqual([20, 60])
        expect(rows[1].cells).toHaveLength(1)
    })
})

describe("stripCellsOf", () => {
    it("keeps only this turn's open + pending cells", () => {
        const cells: Array<{ questionId: string; value: number; where: string }> = [
            { questionId: "a", value: 20, where: "open" },
            { questionId: "b", value: 30, where: "pending" },
            { questionId: "c", value: 40, where: "taken" },
            { questionId: "d", value: 50, where: "free" },
        ]
        expect(stripCellsOf(cells).map((cell) => cell.questionId)).toEqual(["a", "b"])
    })

    it("reads a missing board as empty, not as undefined", () => {
        expect(stripCellsOf(undefined)).toEqual([])
        expect(stripCellsOf(null)).toEqual([])
    })
})
