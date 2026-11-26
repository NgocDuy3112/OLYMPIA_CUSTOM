import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { AssistantSheet } from "@/console/AssistantSheet"
import type { AssistantSurface } from "@/console/model/use-console-assistant"

function surface(over: Partial<AssistantSurface> = {}): AssistantSurface {
    return {
        transcript: [],
        proposals: [],
        error: null,
        ingest: () => {},
        ...over,
    }
}

describe("AssistantSheet — a sheet only when the assistant said something", () => {
    it("renders nothing at all when no assistant frame has arrived", () => {
        const { container } = render(<AssistantSheet surface={surface()} />)
        expect(container).toBeEmptyDOMElement()
    })

    it("renders the transcript once a delta arrives", () => {
        render(
            <AssistantSheet
                surface={surface({ transcript: [{ turnId: "t1", text: "Đã mở vòng", done: true }] })}
            />
        )
        expect(screen.getByText("Đã mở vòng")).toBeInTheDocument()
    })

    it("renders a malformed frame as an alert instead of crashing", () => {
        render(<AssistantSheet surface={surface({ error: "Khung assistant không hợp lệ" })} />)
        expect(screen.getByRole("alert")).toHaveTextContent("Khung assistant không hợp lệ")
    })
})
