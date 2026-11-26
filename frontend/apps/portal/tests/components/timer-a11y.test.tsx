import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { Timer } from "@shared/deck/primitives"

describe("Timer — the countdown speaks twice, not four times a second", () => {
    it("announces the 10-second mark and the end, and stays silent between them", () => {
        const { rerender } = render(<Timer remaining={15_000} />)
        const status = screen.getByRole("status")
        expect(status).toHaveTextContent("")

        rerender(<Timer remaining={10_000} />)
        expect(status).toHaveTextContent("Còn 10 giây")

        rerender(<Timer remaining={4_000} />)
        expect(status).toHaveTextContent("Còn 10 giây")

        rerender(<Timer remaining={0} />)
        expect(status).toHaveTextContent("Hết giờ")
    })

    it("hides the ticking digits from assistive tech", () => {
        render(<Timer remaining={15_000} />)
        expect(screen.getByText("15").closest("[aria-hidden='true']")).not.toBeNull()
    })
})
