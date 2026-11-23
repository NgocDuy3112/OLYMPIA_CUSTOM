import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const root = path.resolve(__dirname, "../../../..")
const stageCss = readFileSync(path.join(root, "shared/styles/stage.css"), "utf8")

function appCss(app: string): string {
    return readFileSync(path.join(root, "apps", app, "src/index.css"), "utf8")
}

describe("shared stage styles", () => {
    it("every surface imports the one shared file", () => {
        for (const app of ["portal", "gameplay", "audience"]) {
            expect(appCss(app), app).toContain('@import "../../../shared/styles/stage.css"')
        }
    })

    it("the apps no longer keep their own glow palettes", () => {
        for (const app of ["portal", "gameplay", "audience"]) {
            const css = appCss(app)
            expect(css, app).not.toContain('[data-glow="ve-dich"]')
            expect(css, app).not.toContain("@property --glow-1")
        }
    })

    it("each round owns its own light colour", () => {
        for (const round of ["khoi-dong", "giai-ma", "but-pha", "ve-dich"]) {
            const block = stageCss.slice(stageCss.indexOf(`[data-glow="${round}"]`))
            const body = block.slice(0, block.indexOf("}"))
            expect(body, round).toContain("--glow-1")
            expect(body, round).toContain("--glow-ink")
        }
    })

    it("the phone-camera layers exist: film grain and a spotlight vignette", () => {
        expect(stageCss).toContain(".stage-grain")
        expect(stageCss).toContain(".stage-vignette")
        expect(stageCss).toContain("--stage-vignette")
        expect(stageCss).toContain("--stage-focus")
    })

    it("the round-change sweep and the state effects are declared", () => {
        for (const rule of [".stage-pulse", ".stage-flash-good", ".stage-flash-bad", ".stage-wash-in"]) {
            expect(stageCss, rule).toContain(rule)
        }
    })

    it("motion is opt-out for users who ask for less", () => {
        const reduced = stageCss.slice(stageCss.indexOf("prefers-reduced-motion"))
        for (const rule of [".stage-pulse", ".stage-wash-in", ".stage-wash"]) {
            expect(reduced, rule).toContain(rule)
        }
    })
})
