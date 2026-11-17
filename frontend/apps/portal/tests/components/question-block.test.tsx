import { describe, expect, it } from "vitest"
import { fireEvent, render } from "@testing-library/react"

import { QuestionBlock } from "@shared/deck/stage"


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

describe("QuestionBlock — any media", () => {
    it("the well hugs the image, capped on both axes", () => {
        const { img } = renderCard({ media: image("https://x/h.jpg") })
        expect(img).not.toBeNull()
        expect(img!.className).toContain("object-contain")
        expect(img!.className).toContain("max-h-[30cqw]")
        expect(img!.className).toContain("max-w-full")
        expect(img!.parentElement!.style.aspectRatio).toBe("")
        expect(img!.parentElement!.className).toContain("self-end")
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

describe("QuestionBlock — media alignment", () => {
    it("with media: the row reserves right padding and the well sits flush right (ml-auto)", () => {
        const { container, img } = renderCard({ media: image("https://x/h.jpg") })
        const row = container.firstElementChild!
        expect(row.className).toContain("pr-[1.2cqw]")
        expect(img!.parentElement!.className).toContain("ml-auto")
    })

    it("without media: no right padding — the text owns the full row", () => {
        const { container } = renderCard()
        const row = container.firstElementChild!
        expect(row.className).not.toContain("pr-[1.2cqw]")
    })
})
