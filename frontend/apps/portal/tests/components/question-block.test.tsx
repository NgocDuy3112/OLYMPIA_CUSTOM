import { describe, expect, it } from "vitest"
import { fireEvent, render } from "@testing-library/react"

import { QuestionBlock } from "@shared/deck/stage"

// The question card's three media realities:
//   none      → the text takes the whole card (no empty gray well)
//   horizontal→ the well spans the row at the image's aspect
//   vertical  → the well stays NARROW at the image's aspect (no pillarbox box)
// plus: a broken URL falls back to the placeholder, audio/video keeps a labeled well.

const image = (url: string) => ({ url, type: "image" })

function renderCard(props: Partial<Parameters<typeof QuestionBlock>[0]> = {}) {
    const view = render(<QuestionBlock question="Câu hỏi thử nghiệm" {...props} />)
    const img = view.container.querySelector("img")
    return { ...view, img }
}

describe("QuestionBlock — no media", () => {
    it("shows no well at all — the text owns the row", () => {
        const { container } = renderCard()
        expect(container.querySelector("img")).toBeNull()
        expect(container.textContent).toContain("Câu hỏi thử nghiệm")
        expect(container.textContent).not.toContain("hình ảnh câu hỏi")
    })
})

describe("QuestionBlock — horizontal media", () => {
    it("the well adopts the image's landscape aspect once loaded", () => {
        const { img } = renderCard({ media: image("https://x/h.jpg") })
        expect(img).not.toBeNull()
        // 16:9 until the browser reports the natural size…
        expect(img!.parentElement!.style.aspectRatio).toBe("16 / 9")

        Object.defineProperty(img!, "naturalWidth", { value: 1200 })
        Object.defineProperty(img!, "naturalHeight", { value: 800 })
        fireEvent.load(img!)
        expect(img!.parentElement!.style.aspectRatio).toBe("1200 / 800")
    })
})

describe("QuestionBlock — vertical media", () => {
    it("the well narrows to the image's portrait aspect (no wide pillarbox)", () => {
        const { img } = renderCard({ media: image("https://x/v.jpg") })
        Object.defineProperty(img!, "naturalWidth", { value: 600 })
        Object.defineProperty(img!, "naturalHeight", { value: 1000 })
        fireEvent.load(img!)
        expect(img!.parentElement!.style.aspectRatio).toBe("600 / 1000")
    })
})

describe("QuestionBlock — degradation", () => {
    it("a broken image falls back to the placeholder, not a torn icon", () => {
        const { container, img } = renderCard({ media: image("https://x/gone.jpg") })
        fireEvent.error(img!)
        expect(container.querySelector("img")).toBeNull()
        expect(container.textContent).toContain("hình ảnh câu hỏi")
    })

    it("audio/video keeps a labeled well (the deck never plays inline)", () => {
        const { container } = renderCard({ media: { url: "https://x/a.mp3", type: "audio" } })
        expect(container.textContent).toContain("media: audio")
    })
})
