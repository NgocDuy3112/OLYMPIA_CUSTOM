import { describe, expect, it } from "vitest"
import { glowKeyOf } from "@shared/lib/glow"

describe("glowKeyOf — which colour the room takes", () => {
    it("Về đích Riêng plays under its own darker stage", () => {
        expect(glowKeyOf("ve-dich", "phase2")).toBe("ve-dich-rieng")
    })

    it("Về đích Chung keeps the round glow", () => {
        expect(glowKeyOf("ve-dich", "phase1")).toBe("ve-dich")
    })

    it("the other rounds are untouched", () => {
        expect(glowKeyOf("khoi-dong", "phase2")).toBe("khoi-dong")
        expect(glowKeyOf("giai-ma", "phase1")).toBe("giai-ma")
        expect(glowKeyOf("but-pha", "phase1")).toBe("but-pha")
    })

    it("waiting or unknown stages fall back to the lobby", () => {
        expect(glowKeyOf("ve-dich", "ended")).toBe("lobby")
        expect(glowKeyOf("vong-moi", "phase1")).toBe("lobby")
    })
})
