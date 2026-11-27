import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { BankPickerItem, ComposeDndProvider } from "@/components/compose-group"
import { renderWithProviders } from "../helpers/render"

function draw(onClick = vi.fn()) {
    renderWithProviders(
        <ComposeDndProvider onAdd={() => {}} onReorder={() => {}}>
            <BankPickerItem sourceId="q1" primary="Hà Nội là thủ đô" typeBadge="TEXT" onClick={onClick} />
        </ComposeDndProvider>
    )
    return onClick
}

describe("the bank picker — the question can be added without a mouse", () => {
    it("is reachable by Tab and adds on Enter", async () => {
        const user = userEvent.setup()
        const onClick = draw()

        await user.tab()
        const item = screen.getByRole("button", { name: "Thêm vào nhóm: Hà Nội là thủ đô" })
        expect(item).toHaveFocus()

        await user.keyboard("{Enter}")
        expect(onClick).toHaveBeenCalledTimes(1)
    })

    it("refuses activation when the row cannot be added", async () => {
        const user = userEvent.setup()
        const onClick = draw()
        renderWithProviders(
            <ComposeDndProvider onAdd={() => {}} onReorder={() => {}}>
                <BankPickerItem sourceId="q2" primary="Câu khoá" disabled onClick={onClick} />
            </ComposeDndProvider>
        )

        const item = screen.getByRole("button", { name: "Thêm vào nhóm: Câu khoá" })
        expect(item).toBeDisabled()

        await user.click(item)
        expect(onClick).not.toHaveBeenCalled()
    })
})
