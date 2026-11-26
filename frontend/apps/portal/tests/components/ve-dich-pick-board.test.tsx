import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { VeDichPickBoard } from "@shared/deck/ve-dich-pick-board"

const cells = [
    { questionId: "a", value: 20, where: "pending" },
    { questionId: "b", value: 20, where: "free" },
    { questionId: "c", value: 20, where: "taken" },
    { questionId: "d", value: 20, where: "free" },
    { questionId: "e", value: 20, where: "free" },
    { questionId: "f", value: 20, where: "free" },
    { questionId: "g", value: 30, where: "free" },
    { questionId: "h", value: 30, where: "free" },
    { questionId: "i", value: 30, where: "free" },
    { questionId: "j", value: 30, where: "free" },
    { questionId: "k", value: 30, where: "free" },
    { questionId: "l", value: 30, where: "free" },
    { questionId: "m", value: 40, where: "deferred" },
]

describe("VeDichPickBoard", () => {
    it("draws two rows of six on the twelve-column grid", () => {
        render(<VeDichPickBoard cells={cells} pickedIds={["a"]} onPick={() => {}} />)

        expect(screen.getAllByRole("button")).toHaveLength(12)
        expect(document.querySelectorAll(".grid")).toHaveLength(2)
    })

    it("never offers the 40- and 50-point bands — chung only plays 20 and 30", () => {
        render(<VeDichPickBoard cells={cells} pickedIds={[]} onPick={() => {}} />)

        const labels = screen.getAllByRole("button").map((button) => button.textContent)
        expect(labels).not.toContain("40")
        expect(labels).not.toContain("50")
    })

    it("says pick, drop and used apart", () => {
        render(<VeDichPickBoard cells={cells} pickedIds={["a"]} onPick={() => {}} />)

        expect(screen.getAllByTitle("Bỏ câu 20 điểm")).toHaveLength(1)
        expect(screen.getAllByTitle("Câu 20 điểm đã dùng")).toHaveLength(1)
        expect(screen.getAllByTitle("Chọn câu 30 điểm")).toHaveLength(6)
    })

    it("a full batch stops offering picks — the free cells say so", () => {
        render(<VeDichPickBoard cells={cells} pickedIds={["a"]} full onPick={() => {}} />)

        // Still free, but past the rule's cap: the hint must not promise a pick.
        expect(screen.queryAllByTitle(/^Chọn câu/)).toHaveLength(0)
        expect(screen.getAllByTitle("Đã đủ câu")).toHaveLength(10)
        expect(screen.getByTitle("Bỏ câu 20 điểm")).toBeInTheDocument()
    })

    it("says a staged pick apart from a used question", () => {
        render(<VeDichPickBoard cells={cells} pickedIds={[]} />)

        // rules.md §7.4: `pending` = chosen but not confirmed — it can still be dropped.
        expect(screen.getAllByTitle("Câu 20 điểm đã chọn — chờ xác nhận")).toHaveLength(1)
        expect(screen.getAllByTitle("Câu 20 điểm đã dùng")).toHaveLength(1)
    })

    it("a read-only board offers nothing and claims nothing", () => {
        render(<VeDichPickBoard cells={cells} pickedIds={["a"]} />)

        expect(screen.queryAllByTitle(/^Chọn câu/)).toHaveLength(0)
        expect(screen.queryAllByTitle(/^Bỏ câu/)).toHaveLength(0)
        for (const button of screen.getAllByRole("button")) expect(button).toBeDisabled()
    })

    it("names each cell by its state and says which pick is pressed", () => {
        render(<VeDichPickBoard cells={cells} pickedIds={["a"]} onPick={() => {}} />)

        const picked = screen.getByRole("button", { name: "Bỏ câu 20 điểm" })
        expect(picked).toHaveAttribute("aria-pressed", "true")

        const free = screen.getAllByRole("button", { name: "Chọn câu 30 điểm" })[0]
        expect(free).toHaveAttribute("aria-pressed", "false")

        const used = screen.getByRole("button", { name: "Câu 20 điểm đã dùng" })
        expect(used).toHaveAttribute("aria-label", "Câu 20 điểm đã dùng")
    })

    it("a read-only board is not a toggle — no aria-pressed", () => {
        render(<VeDichPickBoard cells={cells} pickedIds={["a"]} />)

        for (const button of screen.getAllByRole("button")) {
            expect(button).not.toHaveAttribute("aria-pressed")
            expect(button.getAttribute("aria-label")).toBeTruthy()
        }
    })
})
