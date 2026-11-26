import { act, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useScoreFlash } from "@shared/deck/score-flash"
import { VerdictFlashLayer } from "@shared/deck/verdict-flash"

function Probe({ points }: { points: number }) {
    const flash = useScoreFlash(points)
    return <VerdictFlashLayer flash={flash} points={points} size={34} />
}

describe("verdict flash — the card's answer lands", () => {
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    it("says nothing until the score actually changes", () => {
        render(<Probe points={20} />)
        expect(screen.queryByRole("status")).toBeNull()
    })

    it("shows the delta and a check for a gain", () => {
        const { rerender } = render(<Probe points={20} />)
        rerender(<Probe points={40} />)

        const status = screen.getByRole("status")
        expect(status.querySelector(".lucide-check")).not.toBeNull()
        expect(status.querySelector(".lucide-x")).toBeNull()
        expect(status.textContent).toContain("+20")
        expect(status.getAttribute("aria-label")).toContain("Đúng")
    })

    it("shows a cross for a loss, with a minus not a hyphen", () => {
        const { rerender } = render(<Probe points={20} />)
        rerender(<Probe points={10} />)

        const status = screen.getByRole("status")
        expect(status.querySelector(".lucide-x")).not.toBeNull()
        expect(status.querySelector(".lucide-check")).toBeNull()
        expect(status.textContent).toContain("−10")
        expect(status.getAttribute("aria-label")).toContain("Sai")
    })

    it("hands the card back after the beat", () => {
        const { rerender } = render(<Probe points={20} />)
        rerender(<Probe points={40} />)
        expect(screen.getByRole("status")).toBeTruthy()

        act(() => {
            vi.advanceTimersByTime(2100)
        })
        expect(screen.queryByRole("status")).toBeNull()
    })

    it("replays when the same card is graded again to the same score", () => {
        const { rerender } = render(<Probe points={20} />)
        rerender(<Probe points={40} />)
        const first = screen.getByRole("status").textContent

        act(() => {
            vi.advanceTimersByTime(2100)
        })
        rerender(<Probe points={20} />)
        rerender(<Probe points={40} />)
        expect(screen.getByRole("status").textContent).toBe(first)
    })
})
