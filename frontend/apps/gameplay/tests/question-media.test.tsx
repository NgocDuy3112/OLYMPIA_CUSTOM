import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { QuestionBlock } from "@shared/deck/question"

const image = { url: "https://cdn.example/cau-hoi.png", type: "image" }

describe("the question card's image", () => {
    it("is capped on both axes — it can never push past the card", () => {
        const { container } = render(<QuestionBlock question="Câu hỏi?" media={image} />)
        const img = container.querySelector("img")!
        const box = img.parentElement as HTMLElement

        expect(img.className).toContain("max-h-[30cqw]")
        expect(img.className).toContain("max-w-full")
        expect(img.className).toContain("object-contain")
        expect(img.className).not.toContain("object-cover")
        expect(box.style.aspectRatio).toBe("")
        expect(box.style.height).toBe("")
    })

    it("keeps the well hugging the image — no full-height pillarbox", () => {
        const { container } = render(<QuestionBlock question="Câu hỏi?" media={image} />)
        const box = container.querySelector("img")!.parentElement as HTMLElement

        expect(box.className).toContain("self-end")
        expect(box.className).toContain("flex-1")
        expect(box.className).not.toContain("h-full")
    })
})
