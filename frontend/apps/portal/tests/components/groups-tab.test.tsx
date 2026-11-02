import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { GroupsTab } from "@/components/groups-tab"

// The group stage's FRAME: two groups, four seats each, nothing filled and
// nothing clickable. The point of the test is that a half-drawn group can never
// pass for a finished one — every seat is a placeholder until the draw.

describe("GroupsTab — the empty frame", () => {
    it("draws Nhóm A and Nhóm B", () => {
        render(<GroupsTab />)
        expect(screen.getByText("Nhóm A")).toBeInTheDocument()
        expect(screen.getByText("Nhóm B")).toBeInTheDocument()
    })

    it("seats four contestants per group, all empty", () => {
        render(<GroupsTab />)
        // 2 groups × 4 seat numbers
        expect(screen.getAllByText(/^[1-4]$/)).toHaveLength(8)
        // 2 groups × (1 name + 1 points) placeholders
        expect(screen.getAllByText("—")).toHaveLength(16)
    })

    it("is inert — a placeholder cannot be clicked, a frame is not an editor", () => {
        render(<GroupsTab />)
        expect(screen.queryAllByRole("button")).toHaveLength(0)
    })

    it("says out loud that the contestants come later", () => {
        render(<GroupsTab />)
        expect(screen.getByText("Frame only")).toBeInTheDocument()
        expect(screen.getByText(/filled in at the draw/)).toBeInTheDocument()
    })

    it("renders whatever groups it is handed — the shape the wiring will fill", () => {
        render(
            <GroupsTab
                groups={[
                    { id: "A", seats: [{ seat: 1, name: "An", points: 40 }, { seat: 2, name: null, points: null }] },
                ]}
            />
        )
        expect(screen.getByText("An")).toBeInTheDocument()
        expect(screen.getByText("40")).toBeInTheDocument()
        // the empty seat contributes a name AND a points placeholder
        expect(screen.getAllByText("—")).toHaveLength(2)
        expect(screen.getByText("Nhóm A")).toBeInTheDocument()
        expect(screen.queryByText("Nhóm B")).toBeNull()
    })
})
