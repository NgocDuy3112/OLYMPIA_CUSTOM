import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { RailAnswerLine } from "@shared/deck/rail-answer"

describe("RailAnswerLine — long answer with a timestamp", () => {
    it("keeps the answer clamped so the time stays its own row", () => {
        render(
            <RailAnswerLine
                answer="Ao ma sao từ khoá không"
                answeredMs={10793}
            />
        )

        const answer = screen.getByText("Ao ma sao từ khoá không")
        expect(answer.className).toContain("line-clamp-2")
        expect(answer.className).toContain("overflow-hidden")
        expect(answer.className).toContain("shrink")
    })

    it("shows the elapsed time as ss.mmm on its own line", () => {
        render(<RailAnswerLine answer="Ao ma sao" answeredMs={10793} />)

        expect(screen.getByText("10.793")).toBeInTheDocument()
    })
})
