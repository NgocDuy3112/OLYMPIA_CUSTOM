import { fireEvent, render } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { QuestionBlock } from "@shared/deck/question"

const image = { url: "https://cdn.example/cau-hoi.png", type: "image" }

function loadedImage(container: HTMLElement, width: number, height: number) {
    const img = container.querySelector("img")!
    Object.defineProperty(img, "naturalWidth", { value: width, configurable: true })
    Object.defineProperty(img, "naturalHeight", { value: height, configurable: true })
    fireEvent.load(img)
    return img
}

describe("the question card's image", () => {
    it("caps a portrait photo on both axes — it can never push past the card", () => {
        const { container } = render(<QuestionBlock question="Câu hỏi?" media={image} />)
        const img = loadedImage(container, 900, 1600)
        const box = img.parentElement as HTMLElement

        expect(box.style.maxWidth).toBe("37.4cqw")
        expect(box.style.maxHeight).toBe("min(100%, 34cqw)")
        expect(box.style.aspectRatio).toBe("900 / 1600")
        expect(img.className).toContain("object-contain")
        expect(img.className).not.toContain("object-cover")
    })

    it("waits at 16:9 until it knows the size — and stays bounded meanwhile", () => {
        const { container } = render(<QuestionBlock question="Câu hỏi?" media={image} />)
        const img = container.querySelector("img")!
        const box = img.parentElement as HTMLElement

        expect(box.style.aspectRatio).toBe("16 / 9")
        expect(box.style.maxWidth).toBe("37.4cqw")
        expect(box.style.maxHeight).toBe("min(100%, 34cqw)")
    })
})
