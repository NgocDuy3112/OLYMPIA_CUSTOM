import { describe, expect, it } from "vitest"
import { cellFaded, HINT_TILES, hintTileClass, mcCellClass, playerCellClass, type CellWhere } from "@shared/deck/cells"

// The vé-đích / giải mã class tables: every state must be DISTINGUISHABLE and
// must say what it is (a taken cell is black on both surfaces, an open one is
// primary). These are the only places a cell's look is decided, so a wrong row
// here is a wrong board on the projector.

describe("vé-đích cells", () => {
    it("paints the same state the same way on both surfaces", () => {
        const states: CellWhere[] = ["pending", "open", "taken", "deferred"]
        for (const where of states) {
            const mc = mcCellClass(where, false)
            const player = playerCellClass({ where, chosen: false, actionable: false })
            // one fixed height, widths from the grid span — the board stays balanced
            expect(mc).toContain("h-[4.43cqw]")
            expect(player).toContain("h-[4.43cqw]")
            // The state palette is shared, not duplicated per surface.
            const palette = where === "open"
                ? "bg-primary text-primary-foreground"
                : where === "pending"
                    ? "bg-sky-50 text-sky-800"
                    : where === "taken"
                        ? "bg-black text-white"
                        : "opacity-50"
            expect(mc).toContain(palette)
            expect(player).toContain(palette)
        }
    })

    it("a free cell is plain on the console's grid — only the player's picker is clickable", () => {
        expect(mcCellClass("free", false)).not.toContain("cursor")
        expect(playerCellClass({ where: "free", chosen: false, actionable: true })).toContain("cursor-pointer")
        expect(playerCellClass({ where: "free", chosen: false, actionable: false })).toContain("cursor-default")
    })

    it("the console fades a free cell the turn may not pick", () => {
        expect(mcCellClass("free", true)).toContain("opacity-50")
        expect(mcCellClass("free", false)).not.toContain("opacity-50")
        // A non-free state never gets the "pickable now" treatment.
        expect(mcCellClass("taken", true)).toContain("bg-black")
    })

    it("chosen beats free-but-actionable in the player's picker", () => {
        const chosen = playerCellClass({ where: "free", chosen: true, actionable: true })
        expect(chosen).toContain("ring-sky-500")
        expect(chosen).not.toContain("hover:bg-accent")
    })

    it("cellFaded: deferred is always faded, free is faded only when not pickable", () => {
        expect(cellFaded("deferred", true)).toBe(true)
        expect(cellFaded("free", false)).toBe(true)
        expect(cellFaded("free", true)).toBe(false)
        expect(cellFaded("open", false)).toBe(false)
    })
})

describe("giải mã tiles", () => {
    it("keeps the board EIGHT squares on both surfaces — the show's grid", () => {
        expect(HINT_TILES).toBe(8)
    })

    it("an absent tile is quiet and never clickable", () => {
        expect(hintTileClass("absent", false)).toContain("text-muted-foreground/25")
        expect(hintTileClass("absent", false)).not.toContain("cursor-pointer")
    })

    it("marks the open tile and greys the used one", () => {
        expect(hintTileClass("open", false)).toContain("bg-primary")
        expect(hintTileClass("used", false)).toContain("bg-muted")
        expect(hintTileClass("free", true)).toContain("cursor-pointer")
        expect(hintTileClass("free", false)).not.toContain("cursor-pointer")
    })
})
