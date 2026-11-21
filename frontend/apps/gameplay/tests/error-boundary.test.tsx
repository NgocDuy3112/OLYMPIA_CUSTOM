import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { ErrorBoundary } from "@shared/lib/error-boundary"

function Bomb({ armed }: { armed: boolean }) {
    if (armed) throw new Error("payload vỡ")
    return <p>nội dung an toàn</p>
}

describe("ErrorBoundary", () => {
    it("renders children while nothing throws", () => {
        render(
            <ErrorBoundary scope="test">
                <Bomb armed={false} />
            </ErrorBoundary>
        )
        expect(screen.getByText("nội dung an toàn")).toBeInTheDocument()
    })

    it("catches a render crash and shows the recovery card", () => {
        const quiet = vi.spyOn(console, "error").mockImplementation(() => {})
        render(
            <ErrorBoundary scope="test">
                <Bomb armed />
            </ErrorBoundary>
        )
        expect(screen.getByRole("alert")).toBeInTheDocument()
        expect(screen.getByText("payload vỡ")).toBeInTheDocument()
        expect(screen.getByRole("button", { name: "Tải lại" })).toBeInTheDocument()
        quiet.mockRestore()
    })

    it("lets the operator retry a transient crash", async () => {
        const quiet = vi.spyOn(console, "error").mockImplementation(() => {})
        let armed = true
        const Flaky = () => {
            if (armed) throw new Error("tạm thời")
            return <p>đã hồi</p>
        }
        render(
            <ErrorBoundary scope="test">
                <Flaky />
            </ErrorBoundary>
        )
        armed = false
        await userEvent.click(screen.getByRole("button", { name: "Thử lại" }))
        expect(screen.getByText("đã hồi")).toBeInTheDocument()
        quiet.mockRestore()
    })

    it("honours a custom fallback", () => {
        const quiet = vi.spyOn(console, "error").mockImplementation(() => {})
        render(
            <ErrorBoundary scope="test" fallback={() => <p>fallback riêng</p>}>
                <Bomb armed />
            </ErrorBoundary>
        )
        expect(screen.getByText("fallback riêng")).toBeInTheDocument()
        quiet.mockRestore()
    })
})
