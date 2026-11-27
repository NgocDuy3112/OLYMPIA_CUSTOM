import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"

import { PageHeader } from "@/components/page"

describe("PageHeader — the optional line under the title", () => {
    it("renders the description under the heading", () => {
        render(<PageHeader title="Câu hỏi" description="Ngân hàng câu hỏi của giải." />)

        expect(screen.getByRole("heading", { name: "Câu hỏi" })).toBeInTheDocument()
        expect(screen.getByText("Ngân hàng câu hỏi của giải.")).toBeInTheDocument()
    })

    it("takes a node, so a page can put a link or a count there", () => {
        render(
            <PageHeader
                title="Câu hỏi"
                description={<span data-testid="desc">12 câu</span>}
            />
        )

        expect(screen.getByTestId("desc")).toBeInTheDocument()
    })

    it("keeps the old call sites working — no description, no line", () => {
        const { container } = render(<PageHeader title="Thí sinh" />)

        expect(screen.getByRole("heading", { name: "Thí sinh" })).toBeInTheDocument()
        expect(container.querySelectorAll("p")).toHaveLength(0)
    })
})
