import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { LoadingState } from "@shared/ui/state"

describe("shared LoadingState is a skeleton, not a page", () => {
    it("announces its label on the status landmark", () => {
        render(<LoadingState label="Đang tải trận" />)
        expect(screen.getByRole("status", { name: "Đang tải trận" })).toBeInTheDocument()
    })

    it("leaves the page frame to the caller", () => {
        const { container } = render(<LoadingState />)
        const root = container.firstElementChild as HTMLElement
        expect(root.className).not.toContain("max-w-")
        expect(root.className).not.toContain("mx-auto")
        expect(root.className).not.toContain("px-")
        expect(root.className).not.toContain("py-")
        expect(root.querySelector(".animate-pulse")).not.toBeNull()
    })
})
