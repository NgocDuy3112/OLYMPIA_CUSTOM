import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Inbox } from "lucide-react"
import { describe, expect, it, vi } from "vitest"
import { EmptyState, ErrorPanel, ListSkeleton, LoadingState } from "@shared/ui/state"

describe("shared state primitives", () => {
    it("announces loading on the status landmark", () => {
        render(<LoadingState />)
        expect(screen.getByRole("status", { name: "Đang tải" })).toBeInTheDocument()
    })

    it("announces an error on the alert landmark and offers the retry", async () => {
        const onRetry = vi.fn()
        render(<ErrorPanel title="Không tải được" message="Mất kết nối." onRetry={onRetry} />)
        expect(screen.getByRole("alert")).toHaveTextContent("Mất kết nối.")
        await userEvent.click(screen.getByRole("button", { name: "Thử lại" }))
        expect(onRetry).toHaveBeenCalled()
    })

    it("renders the empty copy and the list skeleton rows", () => {
        render(
            <>
                <EmptyState icon={Inbox} title="Trống" description="Chưa có gì" />
                <ListSkeleton rows={3} />
            </>
        )
        expect(screen.getByText("Trống")).toBeInTheDocument()
        expect(screen.getByText("Chưa có gì")).toBeInTheDocument()
        expect(document.querySelectorAll(".animate-pulse")).toHaveLength(3)
    })
})
