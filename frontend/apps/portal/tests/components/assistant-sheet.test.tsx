import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { AssistantSheet } from "@/console/AssistantSheet"
import type { AssistantSurface } from "@/console/model/use-console-assistant"

function surface(over: Partial<AssistantSurface> = {}): AssistantSurface {
    return {
        transcript: [],
        proposals: [],
        decisions: [],
        error: null,
        ingest: () => {},
        apply: () => {},
        dismiss: () => {},
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

    it("routes the apply button through the surface decision, never around it", async () => {
        const apply = vi.fn()
        const dismiss = vi.fn()
        render(
            <AssistantSheet
                surface={surface({
                    proposals: [
                        {
                            proposalId: "p1",
                            action: { kind: "khoi-dong.start", phase: 1 },
                            rationale: "Mở vòng 1",
                        },
                    ],
                    apply,
                    dismiss,
                })}
            />
        )

        await userEvent.click(screen.getByRole("button", { name: "Áp dụng" }))
        await userEvent.click(screen.getByRole("button", { name: "Bỏ qua" }))

        expect(apply).toHaveBeenCalledWith("p1")
        expect(dismiss).toHaveBeenCalledWith("p1")
    })

    it("keeps a decided proposal visible in the log", () => {
        render(
            <AssistantSheet
                surface={surface({
                    decisions: [
                        {
                            proposalId: "p1",
                            action: { kind: "khoi-dong.start", phase: 1 },
                            outcome: "applied",
                        },
                    ],
                })}
            />
        )
        expect(screen.getByText(/Đã áp dụng/)).toBeInTheDocument()
    })
})
